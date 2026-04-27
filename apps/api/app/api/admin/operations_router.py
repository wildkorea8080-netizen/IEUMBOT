from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.admin_operations import (
    AdminChatbotResponse,
    AdminChatbotsListResponse,
    AdminChatbotUpdateRequest,
    AdminDashboardResponse,
    AdminDashboardQuestionTypeItem,
    AdminDashboardRecentChatItem,
    AdminDashboardUsageTrendItem,
    AdminDocumentResponse,
    AdminDocumentsListResponse,
    AdminDocumentUpdateRequest,
    AdminWidgetResponse,
    AdminWidgetUpdateRequest,
)
from app.services.admin.operations_service import (
    delete_document_service,
    get_dashboard_summary_service,
    get_dashboard_question_types_service,
    get_dashboard_recent_chats_service,
    get_dashboard_usage_trend_service,
    get_chatbot_service,
    get_widget_service,
    list_chatbots_service,
    list_documents_service,
    patch_chatbot_service,
    patch_document_service,
    patch_widget_service,
)

router = APIRouter(tags=["admin-operations"])


@router.get("/dashboard", response_model=AdminDashboardResponse)
def admin_dashboard_summary(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminDashboardResponse:
    return get_dashboard_summary_service(db, principal=principal)


@router.get("/dashboard/usage-trend", response_model=list[AdminDashboardUsageTrendItem])
def admin_dashboard_usage_trend(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[AdminDashboardUsageTrendItem]:
    return get_dashboard_usage_trend_service(
        db,
        principal=principal,
        from_date_raw=from_date,
        to_date_raw=to_date,
    )


@router.get("/dashboard/question-types", response_model=list[AdminDashboardQuestionTypeItem])
def admin_dashboard_question_types(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[AdminDashboardQuestionTypeItem]:
    return get_dashboard_question_types_service(
        db,
        principal=principal,
        from_date_raw=from_date,
        to_date_raw=to_date,
    )


@router.get("/dashboard/recent-chats", response_model=list[AdminDashboardRecentChatItem])
def admin_dashboard_recent_chats(
    limit: int = Query(default=12, ge=1, le=50),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[AdminDashboardRecentChatItem]:
    return get_dashboard_recent_chats_service(
        db,
        principal=principal,
        limit=limit,
    )


@router.get("/documents", response_model=AdminDocumentsListResponse)
def admin_documents_list(
    q: str | None = Query(default=None, max_length=200),
    status_filter: str | None = Query(default=None, alias="status"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminDocumentsListResponse:
    return list_documents_service(
        db,
        principal=principal,
        query=q,
        status_filter=status_filter,
    )


@router.patch("/documents/{document_id}", response_model=AdminDocumentResponse)
def admin_patch_document(
    document_id: str,
    body: AdminDocumentUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminDocumentResponse:
    return patch_document_service(
        db,
        principal=principal,
        document_id=document_id,
        body=body,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_document(
    document_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> Response:
    delete_document_service(
        db,
        principal=principal,
        document_id=document_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/chatbots", response_model=AdminChatbotsListResponse)
def admin_chatbots_list(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminChatbotsListResponse:
    return list_chatbots_service(db, principal=principal)


@router.get("/chatbots/{chatbot_id}", response_model=AdminChatbotResponse)
def admin_get_chatbot(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminChatbotResponse:
    return get_chatbot_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
    )


@router.patch("/chatbots/{chatbot_id}", response_model=AdminChatbotResponse)
def admin_patch_chatbot(
    chatbot_id: str,
    body: AdminChatbotUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminChatbotResponse:
    return patch_chatbot_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )


@router.get("/chatbots/{chatbot_id}/widget", response_model=AdminWidgetResponse)
def admin_get_widget(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminWidgetResponse:
    return get_widget_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
    )


@router.patch("/chatbots/{chatbot_id}/widget", response_model=AdminWidgetResponse)
def admin_patch_widget(
    chatbot_id: str,
    body: AdminWidgetUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminWidgetResponse:
    return patch_widget_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )
