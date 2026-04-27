from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.security import (
    AdminSecurityEventDetailResponse,
    AdminSecurityEventsResponse,
    AdminSecuritySummaryResponse,
)
from app.services.admin.security_service import (
    get_security_event_detail_service,
    get_security_summary_service,
    list_security_events_service,
)

router = APIRouter(tags=["admin-security"])


@router.get("/security/summary", response_model=AdminSecuritySummaryResponse)
def admin_security_summary(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminSecuritySummaryResponse:
    return get_security_summary_service(db, principal=principal)


@router.get("/security/events", response_model=AdminSecurityEventsResponse)
def admin_security_events(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    event_type: str | None = Query(default=None, alias="eventType", max_length=30),
    question: str | None = Query(default=None, max_length=500),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminSecurityEventsResponse:
    return list_security_events_service(
        db,
        principal=principal,
        from_date_raw=from_date,
        to_date_raw=to_date,
        event_type=event_type,
        question_query=question,
        page=page,
        page_size=page_size,
    )


@router.get("/security/events/{event_id}", response_model=AdminSecurityEventDetailResponse)
def admin_security_event_detail(
    event_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminSecurityEventDetailResponse:
    return get_security_event_detail_service(db, principal=principal, event_id=event_id)
