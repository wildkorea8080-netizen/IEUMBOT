from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.knowledge import (
    FaqAnalyzedTopic,
    FaqAnalyzeRequest,
    FaqAnalyzeResponse,
    FaqSuggestedItem,
    KnowledgeApiPreviewItem,
    KnowledgeApiPreviewRequest,
    KnowledgeApiPreviewResponse,
    KnowledgeDetailResponse,
    KnowledgeItem,
    KnowledgeListResponse,
    KnowledgeRuntimeStatusResponse,
    KnowledgeTextCreateRequest,
    KnowledgeUpsertRequest,
    KnowledgeWebsiteCreateRequest,
)
from app.services.admin.knowledge_service import (
    create_file_knowledge_service,
    create_text_knowledge_service,
    create_website_knowledge_service,
    delete_knowledge_service,
    get_knowledge_runtime_status_service,
    get_knowledge_service,
    list_knowledge_diagnostics_service,
    list_knowledge_service,
    patch_knowledge_service,
    preview_api_knowledge_service,
    reindex_all_knowledge_service,
    reindex_knowledge_service,
)

router = APIRouter(tags=["admin-knowledge"])


@router.get("/knowledge", response_model=KnowledgeListResponse)
def admin_list_knowledge(
    source_group: str | None = Query(default=None, alias="sourceGroup"),
    q: str | None = Query(default=None, max_length=200),
    category: str | None = Query(default=None, max_length=100),
    field: str | None = Query(default=None, max_length=100),
    status_filter: str | None = Query(default=None, alias="status", max_length=30),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeListResponse:
    return list_knowledge_service(
        db,
        principal=principal,
        source_group=source_group,
        query=q,
        category=category,
        field=field,
        status_filter=status_filter,
    )


@router.get("/knowledge/runtime-status", response_model=KnowledgeRuntimeStatusResponse)
def admin_get_knowledge_runtime_status(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
) -> KnowledgeRuntimeStatusResponse:
    return get_knowledge_runtime_status_service(principal=principal)


@router.get("/knowledge/diagnostics", response_model=list[KnowledgeItem])
def admin_list_knowledge_diagnostics(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[KnowledgeItem]:
    return list_knowledge_diagnostics_service(db, principal=principal)


@router.post("/knowledge/upload", response_model=KnowledgeDetailResponse)
async def admin_create_file_knowledge(
    chatbot_id: str = Form(...),
    title: str = Form(...),
    category: str | None = Form(default=None),
    field: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    memo: str | None = Form(default=None),
    effective_date: str | None = Form(default=None, alias="effectiveDate"),
    department: str | None = Form(default=None),
    use_vision: bool = Form(False),
    file: UploadFile = File(...),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return await create_file_knowledge_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        file=file,
        title=title,
        category=category,
        field=field,
        tags=tags,
        memo=memo,
        effective_date=effective_date,
        department=department,
        use_vision=use_vision,
    )


@router.post("/knowledge/text", response_model=KnowledgeDetailResponse)
def admin_create_text_knowledge(
    body: KnowledgeTextCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return create_text_knowledge_service(db, principal=principal, body=body)


@router.post("/knowledge/websites", response_model=KnowledgeDetailResponse, status_code=status.HTTP_202_ACCEPTED)
def admin_create_website_knowledge(
    body: KnowledgeWebsiteCreateRequest,
    background_tasks: BackgroundTasks,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return create_website_knowledge_service(
        db, principal=principal, body=body, background_tasks=background_tasks
    )


@router.post("/knowledge/api-source/preview", response_model=KnowledgeApiPreviewResponse)
def admin_preview_api_source(
    body: KnowledgeApiPreviewRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeApiPreviewResponse:
    items = preview_api_knowledge_service(
        db, principal=principal, url=body.url, api_config=body.api_config
    )
    return KnowledgeApiPreviewResponse(
        count=len(items),
        items=[
            KnowledgeApiPreviewItem(
                title=it["title"],
                content_preview=it["contentPreview"],
                url=it.get("url") or None,
            )
            for it in items
        ],
    )


@router.get("/knowledge/{knowledge_id}", response_model=KnowledgeDetailResponse)
def admin_get_knowledge(
    knowledge_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return get_knowledge_service(db, principal=principal, knowledge_id=knowledge_id)


@router.get("/knowledge/{knowledge_id}/content")
def admin_get_knowledge_content(
    knowledge_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    """지식 항목의 실제 텍스트 내용 반환 (DocumentChunk.text_content 합산)."""
    from app.services.admin.knowledge_service import get_knowledge_content_service  # noqa: PLC0415
    return get_knowledge_content_service(db, principal=principal, knowledge_id=knowledge_id)


@router.put("/knowledge/{knowledge_id}/content")
def admin_put_knowledge_content(
    knowledge_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    """지식 내용 수정 → 새 버전 생성 후 재색인."""
    from app.services.admin.knowledge_service import (
        update_knowledge_content_service,  # noqa: PLC0415
    )
    return update_knowledge_content_service(
        db, principal=principal, knowledge_id=knowledge_id,
        content=str(body.get("content") or ""),
        background_tasks=background_tasks,
    )


@router.patch("/knowledge/{knowledge_id}", response_model=KnowledgeDetailResponse)
def admin_patch_knowledge(
    knowledge_id: str,
    body: KnowledgeUpsertRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return patch_knowledge_service(db, principal=principal, knowledge_id=knowledge_id, body=body)


@router.delete("/knowledge/{knowledge_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_knowledge(
    knowledge_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> Response:
    delete_knowledge_service(db, principal=principal, knowledge_id=knowledge_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/knowledge/{knowledge_id}/reindex", response_model=KnowledgeDetailResponse, status_code=status.HTTP_202_ACCEPTED)
def admin_reindex_knowledge(
    knowledge_id: str,
    background_tasks: BackgroundTasks,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return reindex_knowledge_service(
        db,
        principal=principal,
        knowledge_id=knowledge_id,
        background_tasks=background_tasks,
    )


@router.post("/knowledge/reindex-all", status_code=status.HTTP_202_ACCEPTED)
def admin_reindex_all_knowledge(
    chatbot_id: str = Query(alias="chatbotId"),
    background_tasks: BackgroundTasks = None,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    """챗봇의 모든 지식 항목을 일괄 재색인 큐에 등록. Contextual Retrieval 활성화 후 사용."""
    return reindex_all_knowledge_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        background_tasks=background_tasks,
    )


@router.post("/knowledge/{knowledge_id}/analyze-faq", response_model=FaqAnalyzeResponse)
def admin_analyze_faq_from_knowledge(
    knowledge_id: str,
    body: FaqAnalyzeRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> FaqAnalyzeResponse:
    """
    등록된 knowledge의 전체 청크를 2단계 파이프라인으로 분석해 FAQ를 제안.
      Phase 1 — 전체 청크 샘플링 → 주제 클러스터(category/field 포함) 추출
      Phase 2 — 주제별 관련 청크 선택 → 병렬 FAQ 생성
    생성 결과는 저장하지 않고 반환만 함 — 관리자가 검수 후 /faq/bulk-create로 등록.
    """
    from fastapi import HTTPException
    from sqlalchemy import select

    from app.models import DocumentChunk
    from app.repositories.admin.knowledge_repository import get_document_knowledge_row
    from app.services.admin.faq_generation_service import analyze_and_generate_faq
    from app.services.admin.scope_service import require_institution_organization_id

    organization_id = require_institution_organization_id(principal)
    row = get_document_knowledge_row(db, organization_id=organization_id, knowledge_id=knowledge_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Knowledge not found")

    doc, version, _job = row
    if version is None:
        raise HTTPException(status_code=400, detail="Knowledge has no indexed version")

    # 전체 청크 조회 (순서대로)
    chunk_stmt = (
        select(DocumentChunk.text_content)
        .where(DocumentChunk.document_version_id == version.id)
        .order_by(DocumentChunk.chunk_order.asc())
    )
    chunk_texts = [str(t) for t in db.execute(chunk_stmt).scalars().all() if t]

    result = analyze_and_generate_faq(
        db,
        organization_id=organization_id,
        chatbot_id=body.chatbot_id,
        knowledge_id=knowledge_id,
        document_title=doc.title,
        chunk_texts=chunk_texts,
        max_topics=body.max_topics,
        faqs_per_topic=body.faqs_per_topic,
    )

    topics_out = [
        FaqAnalyzedTopic(
            topic=t["topic"],
            description=t["description"],
            category=t.get("category"),
            field=t.get("field"),
            chunk_indices=t.get("chunk_indices", []),
            faqs=[
                FaqSuggestedItem(
                    question=f["question"],
                    answer=f["answer"],
                    tags=f.get("tags", []),
                    topic=f["topic"],
                    category=f.get("category"),
                    field=f.get("field"),
                )
                for f in t.get("faqs", [])
            ],
        )
        for t in result.get("topics", [])
    ]
    return FaqAnalyzeResponse(
        knowledge_id=knowledge_id,
        document_title=doc.title,
        topics=topics_out,
        total_faqs=result.get("total_faqs", 0),
    )


