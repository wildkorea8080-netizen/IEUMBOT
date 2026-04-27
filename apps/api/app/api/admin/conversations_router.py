from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.conversations import (
    AdminConversationDetailResponse,
    AdminConversationsListResponse,
    AdminConversationUpdateRequest,
)
from app.services.admin.conversations_service import (
    get_conversation_detail_service,
    list_conversations_service,
    patch_conversation_service,
)

router = APIRouter(tags=["admin-conversations"])


@router.get("/conversations", response_model=AdminConversationsListResponse)
def admin_list_conversations(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    question: str | None = Query(default=None, max_length=500),
    answer_status: str | None = Query(default=None, alias="answerStatus", max_length=50),
    escalated: bool | None = Query(default=None),
    has_citations: bool | None = Query(default=None, alias="hasCitations"),
    llm_executed: bool | None = Query(default=None, alias="llmExecuted"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminConversationsListResponse:
    return list_conversations_service(
        db,
        principal=principal,
        from_date_raw=from_date,
        to_date_raw=to_date,
        question_query=question,
        answer_status=answer_status,
        escalated=escalated,
        has_citations=has_citations,
        llm_executed=llm_executed,
        page=page,
        page_size=page_size,
    )


@router.get("/conversations/{session_id}", response_model=AdminConversationDetailResponse)
def admin_get_conversation_detail(
    session_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminConversationDetailResponse:
    return get_conversation_detail_service(db, principal=principal, session_id=session_id)


@router.patch("/conversations/{session_id}", response_model=AdminConversationDetailResponse)
def admin_patch_conversation(
    session_id: str,
    body: AdminConversationUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminConversationDetailResponse:
    return patch_conversation_service(db, principal=principal, session_id=session_id, body=body)
