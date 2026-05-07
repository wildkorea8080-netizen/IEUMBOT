from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.knowledge import (
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
    )


@router.post("/knowledge/text", response_model=KnowledgeDetailResponse)
def admin_create_text_knowledge(
    body: KnowledgeTextCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return create_text_knowledge_service(db, principal=principal, body=body)


@router.post("/knowledge/websites", response_model=KnowledgeDetailResponse)
def admin_create_website_knowledge(
    body: KnowledgeWebsiteCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return create_website_knowledge_service(db, principal=principal, body=body)


@router.get("/knowledge/{knowledge_id}", response_model=KnowledgeDetailResponse)
def admin_get_knowledge(
    knowledge_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> KnowledgeDetailResponse:
    return get_knowledge_service(db, principal=principal, knowledge_id=knowledge_id)


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
