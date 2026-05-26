"""
지식 스테이징 API — 업로드 후 AI 분석 → 사용자 검토 → 개별 등록.
"""

import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.models.knowledge_staging import KnowledgeStagingChunk, KnowledgeStagingSession
from app.schemas import ApiSchema
from app.services.admin.scope_service import (
    ensure_chatbot_in_scope,
    require_institution_organization_id,
)
from app.services.admin.knowledge_staging_service import (
    analyze_staging_session_background,
    create_staging_session_immediate,
    register_staging_chunks,
)

router = APIRouter(tags=["admin-knowledge-staging"])


# ── 스키마 ─────────────────────────────────────────────────────────────────────

class StagingChunkItem(ApiSchema):
    id: str
    topic_title: str
    content: str
    tags: list[str]
    pii_detected: bool
    pii_regions: list[dict[str, Any]]
    merge_candidate_title: str | None
    merge_candidate_id: str | None
    merge_score: float | None
    merge_original_content: str | None = None
    registration_type: str
    status: str
    sort_order: int


class StagingSessionResponse(ApiSchema):
    session_id: str
    chatbot_id: str
    source_type: str
    source_name: str | None
    status: str
    total_chunks: int
    is_duplicate_file: bool = False
    chunks: list[StagingChunkItem]


class StagingTextCreateRequest(ApiSchema):
    chatbot_id: str
    title: str
    content: str


class StagingChunkUpdateRequest(ApiSchema):
    topic_title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    status: str | None = None


class StagingRegisterRequest(ApiSchema):
    chunk_ids: list[str] | None = None  # None = 전체 등록


class StagingRegisterResponse(ApiSchema):
    registered: int
    total: int


# ── 헬퍼 ──────────────────────────────────────────────────────────────────────

def _chunk_to_item(row: KnowledgeStagingChunk) -> StagingChunkItem:
    return StagingChunkItem(
        id=str(row.id),
        topic_title=row.topic_title,
        content=row.content,
        tags=list(row.tags or []),
        pii_detected=row.pii_detected,
        pii_regions=list(row.pii_regions or []),
        merge_candidate_title=row.merge_candidate_title,
        merge_candidate_id=row.merge_candidate_id,
        merge_score=row.merge_score,
        merge_original_content=row.merge_original_content,
        registration_type=row.registration_type,
        status=row.status,
        sort_order=row.sort_order,
    )


def _get_session_with_chunks(
    db: Session, session_id: str, organization_id: str
) -> StagingSessionResponse:
    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id),
            KnowledgeStagingSession.organization_id == uuid.UUID(organization_id),
        )
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="STAGING_SESSION_NOT_FOUND")

    chunks = list(
        db.execute(
            select(KnowledgeStagingChunk)
            .where(KnowledgeStagingChunk.session_id == session_row.id)
            .order_by(KnowledgeStagingChunk.sort_order)
        ).scalars().all()
    )
    return StagingSessionResponse(
        session_id=str(session_row.id),
        chatbot_id=str(session_row.chatbot_id),
        source_type=session_row.source_type,
        source_name=session_row.source_name,
        status=session_row.status,
        total_chunks=session_row.total_chunks,
        is_duplicate_file=session_row.is_duplicate_file,
        chunks=[_chunk_to_item(c) for c in chunks],
    )


def _rag_ingest_background(
    chatbot_id: str,
    organization_id: str,
    filename: str,
    text: str,
) -> None:
    """파일 업로드 시 RAG 즉시 색인 (백그라운드 태스크)."""
    from app.db import SessionLocal  # noqa: PLC0415
    from app.services.admin.knowledge_service import create_text_knowledge_internal  # noqa: PLC0415

    db = SessionLocal()
    try:
        create_text_knowledge_internal(
            db,
            chatbot_id=chatbot_id,
            organization_id=organization_id,
            title=filename,
            content=text,
            tags=[],
        )
        import logging  # noqa: PLC0415
        logging.getLogger(__name__).info("[STAGING] RAG background ingest done file=%s", filename)
    except Exception as exc:
        import logging  # noqa: PLC0415
        logging.getLogger(__name__).warning("[STAGING] RAG background ingest failed file=%s: %s", filename, exc)
    finally:
        db.close()


# ── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.post("/knowledge/staging/text", response_model=StagingSessionResponse, status_code=201)
def create_staging_from_text(
    body: StagingTextCreateRequest,
    background_tasks: BackgroundTasks,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> StagingSessionResponse:
    """텍스트 입력 → 즉시 세션 생성 후 백그라운드 분석."""
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    org_id = require_institution_organization_id(principal)

    if not body.content.strip():
        raise HTTPException(status_code=422, detail="CONTENT_REQUIRED")

    session_row = create_staging_session_immediate(
        db,
        chatbot_id=body.chatbot_id,
        organization_id=org_id,
        source_type="text",
        source_name=body.title or "텍스트 입력",
    )
    background_tasks.add_task(
        analyze_staging_session_background,
        str(session_row.id), body.content, body.chatbot_id, org_id,
    )
    return _get_session_with_chunks(db, str(session_row.id), org_id)


@router.post("/knowledge/staging/file", response_model=StagingSessionResponse, status_code=201)
async def create_staging_from_file(
    background_tasks: BackgroundTasks,
    chatbot_id: str = Form(...),
    file: UploadFile = File(...),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> StagingSessionResponse:
    """파일 업로드 → 텍스트 추출(동기) → 즉시 세션 생성 → 분석은 백그라운드."""
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    org_id = require_institution_organization_id(principal)

    file_bytes = await file.read()
    filename = file.filename or "unknown"

    # 텍스트 추출 (동기, 빠름)
    try:
        from app.services.admin.knowledge_service import _extract_document_text  # noqa: PLC0415
        content_type = file.content_type or ""
        text, _, _ = _extract_document_text(filename, file_bytes, content_type, use_vision=False, db=db)
    except Exception:
        try:
            text = file_bytes.decode("utf-8", errors="replace")
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"FILE_TEXT_EXTRACTION_FAILED: {exc}") from exc

    if not text.strip():
        raise HTTPException(status_code=422, detail="FILE_EMPTY_OR_UNREADABLE")

    # 중복 파일 감지 (동일 챗봇 내 같은 파일명의 활성 버전 존재 여부)
    from app.models.documents import Document  # noqa: PLC0415
    from app.models.document_versions import DocumentVersion as DocVersion  # noqa: PLC0415

    existing = db.execute(
        select(DocVersion.id)
        .join(Document, DocVersion.document_id == Document.id)
        .where(
            Document.chatbot_id == uuid.UUID(chatbot_id),
            Document.status == "active",
            DocVersion.file_name == filename,
            DocVersion.is_active.is_(True),
        )
        .limit(1)
    ).scalar_one_or_none()
    is_duplicate = existing is not None

    # 세션 즉시 생성
    session_row = create_staging_session_immediate(
        db,
        chatbot_id=chatbot_id,
        organization_id=org_id,
        source_type="file",
        source_name=filename,
        is_duplicate_file=is_duplicate,
    )

    # 중복 아닌 경우: RAG 색인 즉시 트리거 (백그라운드)
    if not is_duplicate:
        background_tasks.add_task(
            _rag_ingest_background,
            chatbot_id, org_id, filename, text,
        )

    # AI 분석은 백그라운드에서 수행 (타임아웃 방지)
    background_tasks.add_task(
        analyze_staging_session_background,
        str(session_row.id), text, chatbot_id, org_id,
    )

    return _get_session_with_chunks(db, str(session_row.id), org_id)


@router.get("/knowledge/staging/{session_id}", response_model=StagingSessionResponse)
def get_staging_session(
    session_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> StagingSessionResponse:
    org_id = require_institution_organization_id(principal)
    return _get_session_with_chunks(db, session_id, org_id)


@router.patch("/knowledge/staging/{session_id}/chunks/{chunk_id}", response_model=StagingChunkItem)
def update_staging_chunk(
    session_id: str,
    chunk_id: str,
    body: StagingChunkUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> StagingChunkItem:
    """청크 제목·내용·태그·상태 편집."""
    org_id = require_institution_organization_id(principal)

    # 세션 소속 검증
    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id),
            KnowledgeStagingSession.organization_id == uuid.UUID(org_id),
        )
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=404, detail="STAGING_SESSION_NOT_FOUND")

    chunk_row = db.execute(
        select(KnowledgeStagingChunk).where(
            KnowledgeStagingChunk.id == uuid.UUID(chunk_id),
            KnowledgeStagingChunk.session_id == session_row.id,
        )
    ).scalar_one_or_none()
    if chunk_row is None:
        raise HTTPException(status_code=404, detail="STAGING_CHUNK_NOT_FOUND")

    if body.topic_title is not None:
        chunk_row.topic_title = body.topic_title
    if body.content is not None:
        chunk_row.content = body.content
        # 내용 변경 시 PII 재감지
        from app.services.admin.pii_detector_service import detect_pii  # noqa: PLC0415
        pii_found, pii_regions = detect_pii(body.content)
        chunk_row.pii_detected = pii_found
        chunk_row.pii_regions = pii_regions
    if body.tags is not None:
        chunk_row.tags = body.tags
    if body.status is not None and body.status in ("pending", "skipped"):
        chunk_row.status = body.status

    db.commit()
    db.refresh(chunk_row)
    return _chunk_to_item(chunk_row)


@router.post("/knowledge/staging/{session_id}/register", response_model=StagingRegisterResponse)
def register_staging(
    session_id: str,
    body: StagingRegisterRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> StagingRegisterResponse:
    """선택된(또는 전체) 청크를 실제 지식으로 등록."""
    org_id = require_institution_organization_id(principal)

    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id),
            KnowledgeStagingSession.organization_id == uuid.UUID(org_id),
        )
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=404, detail="STAGING_SESSION_NOT_FOUND")

    result = register_staging_chunks(
        db,
        session_id=session_id,
        chatbot_id=str(session_row.chatbot_id),
        chunk_ids=body.chunk_ids,
    )
    return StagingRegisterResponse(**result)


class StagingFromKnowledgeRequest(ApiSchema):
    chatbot_id: str


@router.post(
    "/knowledge/staging/from-knowledge/{knowledge_id}",
    response_model=StagingSessionResponse,
    status_code=201,
)
def create_staging_from_knowledge(
    knowledge_id: str,
    body: StagingFromKnowledgeRequest,
    background_tasks: BackgroundTasks,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> StagingSessionResponse:
    """기존 지식 문서의 텍스트를 가져와 스테이징 세션을 생성 (FAQ 재분석용)."""
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    org_id = require_institution_organization_id(principal)

    from app.models.documents import Document  # noqa: PLC0415
    from app.models.document_versions import DocumentVersion  # noqa: PLC0415
    from app.models.document_chunks import DocumentChunk  # noqa: PLC0415

    doc = db.execute(
        select(Document).where(
            Document.id == uuid.UUID(knowledge_id),
            Document.chatbot_id == uuid.UUID(body.chatbot_id),
            Document.status == "active",
        )
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="KNOWLEDGE_NOT_FOUND")

    version = db.execute(
        select(DocumentVersion)
        .where(
            DocumentVersion.document_id == doc.id,
            DocumentVersion.is_active.is_(True),
            DocumentVersion.status == "completed",
        )
        .order_by(DocumentVersion.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=422, detail="KNOWLEDGE_NOT_INDEXED")

    chunk_texts = db.execute(
        select(DocumentChunk.text_content)
        .where(DocumentChunk.document_version_id == version.id)
        .order_by(DocumentChunk.chunk_index)
        .limit(30)
    ).scalars().all()

    text = "\n\n".join(c for c in chunk_texts if c)
    if not text.strip():
        raise HTTPException(status_code=422, detail="KNOWLEDGE_CONTENT_EMPTY")

    session_row = create_staging_session_immediate(
        db,
        chatbot_id=body.chatbot_id,
        organization_id=org_id,
        source_type="knowledge",
        source_name=doc.title,
    )
    background_tasks.add_task(
        analyze_staging_session_background,
        str(session_row.id), text, body.chatbot_id, org_id,
    )
    return _get_session_with_chunks(db, str(session_row.id), org_id)


@router.delete("/knowledge/staging/{session_id}", status_code=204)
def delete_staging_session(
    session_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> None:
    org_id = require_institution_organization_id(principal)
    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id),
            KnowledgeStagingSession.organization_id == uuid.UUID(org_id),
        )
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=404, detail="STAGING_SESSION_NOT_FOUND")
    db.delete(session_row)
    db.commit()
