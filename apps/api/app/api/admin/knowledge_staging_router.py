"""
지식 스테이징 API — 업로드 후 AI 분석 → 사용자 검토 → 개별 등록.
"""

import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy import delete, or_, select
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


# 프론트 폴링 타임아웃(360s)보다 길게 둬서, 정상 진행 중인 세션을
# 백엔드가 먼저 "failed"로 뒤집는 오탐을 방지한다. 진짜 유실(서버 재시작 등)만 stale 처리.
_ANALYZING_STALE_SECONDS = 420  # 7분


def _get_session_with_chunks(
    db: Session, session_id: str, organization_id: str
) -> StagingSessionResponse:
    from datetime import datetime, timezone  # noqa: PLC0415

    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id),
            KnowledgeStagingSession.organization_id == uuid.UUID(organization_id),
        )
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="STAGING_SESSION_NOT_FOUND")

    # 백그라운드 태스크가 서버 재시작 등으로 유실된 경우 스테일 감지
    if session_row.status == "analyzing":
        created = session_row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - created).total_seconds()
        if elapsed > _ANALYZING_STALE_SECONDS:
            session_row.status = "failed"
            db.commit()

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


def _process_file_staging_background(
    session_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    chatbot_id: str,
    organization_id: str,
    is_duplicate: bool,
) -> None:
    """파일 텍스트 추출 → RAG 색인(신규만) → AI 분석을 모두 백그라운드에서 처리."""
    import logging  # noqa: PLC0415
    from app.db import SessionLocal  # noqa: PLC0415

    _log = logging.getLogger(__name__)

    # 1. 텍스트 추출
    try:
        db_extract = SessionLocal()
        try:
            from app.services.admin.knowledge_service import _extract_document_text  # noqa: PLC0415
            text, _, _ = _extract_document_text(filename, file_bytes, content_type, use_vision=False, db=db_extract)
        except Exception:
            text = file_bytes.decode("utf-8", errors="replace")
        finally:
            db_extract.close()
    except Exception as exc:
        _log.error("[STAGING] file extraction failed session=%s: %s", session_id, exc)
        _mark_session_failed(session_id)
        return

    if not text.strip():
        _log.warning("[STAGING] extracted text empty session=%s", session_id)
        _mark_session_failed(session_id)
        return

    # 2. AI 분석 (RAG 색인보다 먼저 수행)
    #    색인을 먼저 하면 병합 후보 검사(_check_merge_candidate)가 방금 올린 파일 자신을
    #    찾아 "기존 지식과 94% 유사"로 오인식한다. 분석을 먼저 돌려 기존 지식하고만 비교한다.
    from app.services.admin.knowledge_staging_service import analyze_staging_session_background  # noqa: PLC0415
    analyze_staging_session_background(session_id, text, chatbot_id, organization_id)

    # 3. RAG 색인 (신규 파일만)
    if not is_duplicate:
        try:
            db_rag = SessionLocal()
            try:
                from app.services.admin.knowledge_service import create_text_knowledge_internal  # noqa: PLC0415
                create_text_knowledge_internal(
                    db_rag, chatbot_id=chatbot_id, organization_id=organization_id,
                    title=filename, content=text, tags=[],
                )
            finally:
                db_rag.close()
        except Exception as exc:
            _log.warning("[STAGING] RAG ingest failed file=%s: %s (analysis continues)", filename, exc)


def _mark_session_failed(session_id: str) -> None:
    from app.db import SessionLocal  # noqa: PLC0415
    db = SessionLocal()
    try:
        session_row = db.execute(
            select(KnowledgeStagingSession).where(
                KnowledgeStagingSession.id == uuid.UUID(session_id)
            )
        ).scalar_one_or_none()
        if session_row:
            session_row.status = "failed"
            db.commit()
    except Exception:
        db.rollback()
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
    """파일 업로드 → 세션 즉시 생성 → 텍스트 추출·RAG 색인·AI 분석 모두 백그라운드."""
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    org_id = require_institution_organization_id(principal)

    file_bytes = await file.read()
    filename = file.filename or "unknown"
    content_type = file.content_type or ""

    # 중복 파일 감지 (빠른 DB 조회만)
    from app.models.documents import Document  # noqa: PLC0415
    from app.models.document_versions import DocumentVersion as DocVersion  # noqa: PLC0415

    # 스테이징 원본 문서는 create_text_knowledge_internal로 생성되며
    # file_name="<파일명>.txt", title="<파일명>"으로 저장된다.
    # 따라서 원본 파일명 == file_name 만 비교하면 재업로드를 놓친다 → 세 형태 모두 매칭.
    existing = db.execute(
        select(DocVersion.id)
        .join(Document, DocVersion.document_id == Document.id)
        .where(
            Document.chatbot_id == uuid.UUID(chatbot_id),
            Document.status == "active",
            or_(
                DocVersion.file_name == filename,
                DocVersion.file_name == f"{filename}.txt",
                Document.title == filename,
            ),
            DocVersion.is_active.is_(True),
        )
        .limit(1)
    ).scalar_one_or_none()
    is_duplicate = existing is not None

    # 세션 즉시 생성 후 바로 응답 (텍스트 추출·분석은 백그라운드)
    session_row = create_staging_session_immediate(
        db,
        chatbot_id=chatbot_id,
        organization_id=org_id,
        source_type="file",
        source_name=filename,
        is_duplicate_file=is_duplicate,
    )

    background_tasks.add_task(
        _process_file_staging_background,
        str(session_row.id), file_bytes, filename, content_type,
        chatbot_id, org_id, is_duplicate,
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


@router.post("/knowledge/staging/{session_id}/reanalyze", response_model=StagingSessionResponse)
def reanalyze_staging_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> StagingSessionResponse:
    """분석 실패/타임아웃 세션을 보관된 원본 텍스트로 재분석.

    RAG 색인은 최초 업로드 시 이미 완료됐으므로 재색인하지 않고
    FAQ 주제 분석만 다시 수행한다.
    """
    import logging as _log  # noqa: PLC0415
    _logger = _log.getLogger(__name__)

    org_id = require_institution_organization_id(principal)

    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id),
            KnowledgeStagingSession.organization_id == uuid.UUID(org_id),
        )
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=404, detail="STAGING_SESSION_NOT_FOUND")

    text = session_row.extracted_text
    if not text or not text.strip():
        # 구버전 세션(텍스트 미보관) 또는 추출 실패 → 재업로드 안내
        raise HTTPException(status_code=409, detail="STAGING_TEXT_UNAVAILABLE")

    # 이전 분석 청크 제거 후 analyzing 으로 리셋
    db.execute(
        delete(KnowledgeStagingChunk).where(
            KnowledgeStagingChunk.session_id == session_row.id
        )
    )
    session_row.status = "analyzing"
    session_row.total_chunks = 0
    db.commit()

    _logger.info("[STAGING] reanalyze requested session=%s text_len=%d", session_id, len(text))
    background_tasks.add_task(
        analyze_staging_session_background,
        session_id, text, str(session_row.chatbot_id), org_id,
    )
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
    import logging as _log  # noqa: PLC0415
    _logger = _log.getLogger(__name__)

    org_id = require_institution_organization_id(principal)

    session_row = db.execute(
        select(KnowledgeStagingSession).where(
            KnowledgeStagingSession.id == uuid.UUID(session_id),
            KnowledgeStagingSession.organization_id == uuid.UUID(org_id),
        )
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=404, detail="STAGING_SESSION_NOT_FOUND")

    try:
        result = register_staging_chunks(
            db,
            session_id=session_id,
            chatbot_id=str(session_row.chatbot_id),
            chunk_ids=body.chunk_ids,
        )
    except Exception as exc:
        _logger.error("[STAGING] register failed session=%s: %s", session_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"REGISTER_FAILED: {exc}") from exc
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
        .order_by(DocumentChunk.chunk_order)
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
