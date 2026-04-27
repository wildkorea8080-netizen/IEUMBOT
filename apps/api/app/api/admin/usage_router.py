from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.usage import (
    AdminChatbotUsageResponse,
    AdminUsageDailyResponse,
    AdminUsageSummaryResponse,
)
from app.services.admin.usage_service import (
    get_usage_chatbots_service,
    get_usage_daily_service,
    get_usage_summary_service,
)

router = APIRouter(tags=["admin-usage"])


@router.get("/usage/summary", response_model=AdminUsageSummaryResponse)
def admin_usage_summary(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminUsageSummaryResponse:
    return get_usage_summary_service(db, principal=principal)


@router.get("/usage/daily", response_model=AdminUsageDailyResponse)
def admin_usage_daily(
    range_type: str | None = Query(default="30d", alias="rangeType"),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminUsageDailyResponse:
    return get_usage_daily_service(
        db,
        principal=principal,
        range_type=range_type,
        from_raw=from_date,
        to_raw=to_date,
    )


@router.get("/usage/chatbots", response_model=AdminChatbotUsageResponse)
def admin_usage_chatbots(
    range_type: str | None = Query(default="30d", alias="rangeType"),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminChatbotUsageResponse:
    return get_usage_chatbots_service(
        db,
        principal=principal,
        range_type=range_type,
        from_raw=from_date,
        to_raw=to_date,
    )

