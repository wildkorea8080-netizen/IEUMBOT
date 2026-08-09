import logging

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas import ApiSchema
from app.schemas.admin_operations import (
    AdminChatbotCreateRequest,
    AdminChatbotResponse,
    AdminChatbotsListResponse,
    AdminChatbotUpdateRequest,
    AdminDashboardQuestionTypeItem,
    AdminDashboardRecentChatItem,
    AdminDashboardResponse,
    AdminDashboardUsageTrendItem,
    AdminDocumentResponse,
    AdminDocumentsListResponse,
    AdminDocumentUpdateRequest,
    AdminKnowledgeGapResponse,
    AdminQualityReportResponse,
    AdminRoiDashboardResponse,
    AdminWidgetResponse,
    AdminWidgetUpdateRequest,
    DocumentFeedbackResponse,
    FeedbackSummaryResponse,
    LowRatedMessagesResponse,
)
from app.schemas.chat_policy import PreAnswerRequest
from app.schemas.chat_runtime import ChatRuntimeResponse
from app.services.admin.operations_service import (
    create_admin_widget_service,
    create_chatbot_service,
    delete_document_service,
    get_chatbot_service,
    get_dashboard_question_types_service,
    get_dashboard_recent_chats_service,
    get_dashboard_summary_service,
    get_dashboard_usage_trend_service,
    get_knowledge_gap_service,
    get_quality_report_service,
    get_roi_dashboard_service,
    get_widget_service,
    list_chatbots_service,
    list_documents_service,
    patch_chatbot_service,
    patch_document_service,
    patch_widget_service,
)
from app.services.admin.scope_service import (
    ensure_chatbot_in_scope,
    require_institution_organization_id,
)
from app.services.chat.final_chat_pipeline_service import build_chat_pipeline_error_response, run_final_chat_pipeline

router = APIRouter(tags=["admin-operations"])
logger = logging.getLogger(__name__)


@router.get("/dashboard", response_model=AdminDashboardResponse)
def admin_dashboard_summary(
    chatbot_id: str | None = Query(default=None, alias="chatbotId", max_length=64),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminDashboardResponse:
    return get_dashboard_summary_service(db, principal=principal, chatbot_id=chatbot_id)


@router.get("/dashboard/usage-trend", response_model=list[AdminDashboardUsageTrendItem])
def admin_dashboard_usage_trend(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    chatbot_id: str | None = Query(default=None, alias="chatbotId", max_length=64),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[AdminDashboardUsageTrendItem]:
    return get_dashboard_usage_trend_service(
        db,
        principal=principal,
        from_date_raw=from_date,
        to_date_raw=to_date,
        chatbot_id=chatbot_id,
    )


@router.get("/dashboard/question-types", response_model=list[AdminDashboardQuestionTypeItem])
def admin_dashboard_question_types(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    chatbot_id: str | None = Query(default=None, alias="chatbotId", max_length=64),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[AdminDashboardQuestionTypeItem]:
    return get_dashboard_question_types_service(
        db,
        principal=principal,
        from_date_raw=from_date,
        to_date_raw=to_date,
        chatbot_id=chatbot_id,
    )


@router.get("/dashboard/recent-chats", response_model=list[AdminDashboardRecentChatItem])
def admin_dashboard_recent_chats(
    limit: int = Query(default=12, ge=1, le=50),
    chatbot_id: str | None = Query(default=None, alias="chatbotId", max_length=64),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[AdminDashboardRecentChatItem]:
    return get_dashboard_recent_chats_service(
        db,
        principal=principal,
        limit=limit,
        chatbot_id=chatbot_id,
    )


@router.get("/quality-report", response_model=AdminQualityReportResponse)
def admin_quality_report(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    start_date: str | None = Query(default=None, alias="startDate"),
    end_date: str | None = Query(default=None, alias="endDate"),
    fallback_only: bool = Query(default=False, alias="fallbackOnly"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminQualityReportResponse:
    return get_quality_report_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        start_date_raw=start_date,
        end_date_raw=end_date,
        fallback_only=fallback_only,
    )


class QualityBackfillEstimate(ApiSchema):
    target_count: int
    estimated_cost_usd: float
    # target_count가 일일 처리 상한(DAILY_LIMIT_PER_ORG)에서 잘렸는지. 조용히
    # 자르면 관리자가 승인한 건수보다 실제 처리 건수가 적어도 알 방법이 없다.
    capped: bool


class QualityBackfillResult(ApiSchema):
    evaluated: int
    skipped: int
    failed: int


@router.get("/quality-report/backfill/estimate", response_model=QualityBackfillEstimate)
def admin_quality_backfill_estimate(
    # 같은 라우터의 /quality-report 가 camelCase alias를 쓴다. 규약이 갈리면
    # 프론트가 한쪽만 맞춰 422가 난다(과거 실제 발생).
    chatbot_id: str = Query(alias="chatbotId"),
    start_date: str = Query(alias="startDate"),
    end_date: str = Query(alias="endDate"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> QualityBackfillEstimate:
    """소급 평가 대상 건수와 예상 비용. 실행 전에 반드시 보여준다.

    list_unevaluated_messages의 원시 건수가 아니라 count_evaluable_messages로
    should_evaluate 필터를 적용한 실제 채점 대상만 센다 — 인사말·캐시히트·
    미답변 건까지 세면 관리자가 부풀려진 금액을 보고 승인하게 된다.
    """
    from datetime import datetime  # noqa: PLC0415

    from app.services.quality.evaluation_service import (  # noqa: PLC0415
        count_evaluable_messages,
        estimate_backfill_cost_usd,
    )

    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    target_count, capped = count_evaluable_messages(
        db,
        chatbot_id=chatbot_id,
        start_at=datetime.fromisoformat(start_date),
        end_at=datetime.fromisoformat(end_date),
    )
    return QualityBackfillEstimate(
        target_count=target_count,
        estimated_cost_usd=estimate_backfill_cost_usd(target_count),
        capped=capped,
    )


@router.post("/quality-report/backfill", response_model=QualityBackfillResult)
def admin_quality_backfill(
    chatbot_id: str = Query(alias="chatbotId"),
    start_date: str = Query(alias="startDate"),
    end_date: str = Query(alias="endDate"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> QualityBackfillResult:
    """지정 기간 소급 평가. 이미 평가된 건은 UNIQUE 제약으로 자동 제외된다."""
    from datetime import datetime  # noqa: PLC0415

    from app.services.quality.evaluation_service import evaluate_chatbot_range  # noqa: PLC0415

    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    organization_id = require_institution_organization_id(principal)
    result = evaluate_chatbot_range(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        start_at=datetime.fromisoformat(start_date),
        end_at=datetime.fromisoformat(end_date),
    )
    return QualityBackfillResult(
        evaluated=result["evaluated"], skipped=result["skipped"], failed=result["failed"]
    )


@router.get("/knowledge-gap", response_model=AdminKnowledgeGapResponse)
def admin_knowledge_gap(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    start_date: str | None = Query(default=None, alias="startDate"),
    end_date: str | None = Query(default=None, alias="endDate"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminKnowledgeGapResponse:
    return get_knowledge_gap_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        start_date_raw=start_date,
        end_date_raw=end_date,
    )


@router.get("/roi-dashboard", response_model=AdminRoiDashboardResponse)
def admin_roi_dashboard(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    start_date: str | None = Query(default=None, alias="startDate"),
    end_date: str | None = Query(default=None, alias="endDate"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminRoiDashboardResponse:
    return get_roi_dashboard_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        start_date_raw=start_date,
        end_date_raw=end_date,
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


@router.post("/chatbots", response_model=AdminChatbotResponse, status_code=status.HTTP_201_CREATED)
def admin_create_chatbot(
    body: AdminChatbotCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminChatbotResponse:
    return create_chatbot_service(
        db,
        principal=principal,
        body=body,
    )


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


@router.post("/chatbots/{chatbot_id}/test-chat", response_model=ChatRuntimeResponse)
def admin_test_chatbot(
    chatbot_id: str,
    body: PreAnswerRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> ChatRuntimeResponse:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    scoped_body = body.model_copy(update={"chatbot_id": chatbot_id})
    try:
        return run_final_chat_pipeline(db, body=scoped_body, stream_mode="admin_test", include_debug_trace=True)
    except Exception as exc:
        logger.exception("Admin test chat pipeline failed", extra={"chatbot_id": chatbot_id})
        db.rollback()
        return build_chat_pipeline_error_response(
            body=scoped_body,
            exc=exc,
            include_debug_trace=True,
            stream_mode="admin_test",
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


@router.post("/chatbots/{chatbot_id}/analyze-url")
def admin_analyze_url_for_chatbot(
    chatbot_id: str,
    body: dict,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    """URL을 분석해 AI 기본 설정값을 자동 제안한다."""
    from app.services.admin.url_analyzer_service import analyze_url_for_chatbot_settings  # noqa: PLC0415
    url = str(body.get("url", "")).strip()
    if not url:
        from fastapi import HTTPException  # noqa: PLC0415
        raise HTTPException(status_code=422, detail="URL_REQUIRED")
    from app.services.admin.scope_service import ensure_chatbot_in_scope  # noqa: PLC0415
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    return analyze_url_for_chatbot_settings(db, url=url)


@router.post("/chatbots/{chatbot_id}/widget", response_model=AdminWidgetResponse, status_code=status.HTTP_201_CREATED)
def admin_create_widget(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminWidgetResponse:
    return create_admin_widget_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
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


@router.get("/feedback/summary", response_model=FeedbackSummaryResponse)
def admin_get_feedback_summary(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> FeedbackSummaryResponse:
    from app.services.admin.feedback_stats_service import get_feedback_summary
    from app.services.admin.scope_service import require_institution_organization_id
    return get_feedback_summary(
        db,
        organization_id=require_institution_organization_id(principal),
        chatbot_id=chatbot_id,
    )


@router.get("/feedback/low-rated", response_model=LowRatedMessagesResponse)
def admin_list_low_rated_messages(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> LowRatedMessagesResponse:
    from app.services.admin.feedback_stats_service import list_low_rated_messages
    from app.services.admin.scope_service import require_institution_organization_id
    return list_low_rated_messages(
        db,
        organization_id=require_institution_organization_id(principal),
        chatbot_id=chatbot_id,
        limit=limit,
        offset=offset,
    )


@router.get("/feedback/by-document", response_model=DocumentFeedbackResponse)
def admin_get_feedback_by_document(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> DocumentFeedbackResponse:
    from app.services.admin.feedback_stats_service import get_feedback_by_document
    from app.services.admin.scope_service import require_institution_organization_id
    items = get_feedback_by_document(
        db,
        organization_id=require_institution_organization_id(principal),
        chatbot_id=chatbot_id,
    )
    return DocumentFeedbackResponse(items=items)
