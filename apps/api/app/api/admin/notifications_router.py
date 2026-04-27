from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.notifications import NotificationListResponse
from app.services.notification_service import list_notifications_service

router = APIRouter(tags=["admin-notifications"])


@router.get("/notifications", response_model=NotificationListResponse)
def admin_list_notifications(
    severity: str | None = Query(default=None),
    type_value: str | None = Query(default=None, alias="type"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> NotificationListResponse:
    return list_notifications_service(
        db,
        organization_id=principal.organization_id,
        severity=severity,
        type_value=type_value,
    )
