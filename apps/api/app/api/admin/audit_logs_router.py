from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.audit_logs import AdminAuditLogDetailResponse, AdminAuditLogsResponse
from app.services.admin.audit_logs_service import get_audit_log_detail_service, list_audit_logs_service

router = APIRouter(tags=["admin-audit-logs"])


@router.get("/audit-logs", response_model=AdminAuditLogsResponse)
def admin_audit_logs(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    admin_email: str | None = Query(default=None, alias="adminEmail", max_length=255),
    action_type: str | None = Query(default=None, alias="actionType", max_length=50),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminAuditLogsResponse:
    return list_audit_logs_service(
        db,
        principal=principal,
        from_date_raw=from_date,
        to_date_raw=to_date,
        admin_email=admin_email,
        action_type=action_type,
        page=page,
        page_size=page_size,
    )


@router.get("/audit-logs/{log_id}", response_model=AdminAuditLogDetailResponse)
def admin_audit_log_detail(
    log_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminAuditLogDetailResponse:
    return get_audit_log_detail_service(db, principal=principal, log_id=log_id)

