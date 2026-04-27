from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.schemas.system_controls import PublicAnnouncementsResponse, PublicSystemStatusResponse
from app.services.system_controls_service import (
    get_public_system_status_service,
    list_public_announcements_service,
)

router = APIRouter(tags=["public"])


@router.get("/announcements", response_model=PublicAnnouncementsResponse)
def public_announcements(
    organization_id: str | None = Query(default=None, alias="organizationId"),
    db: Session = Depends(get_db_session),
) -> PublicAnnouncementsResponse:
    return list_public_announcements_service(db, organization_id=organization_id)


@router.get("/system-status", response_model=PublicSystemStatusResponse)
def public_system_status(
    db: Session = Depends(get_db_session),
) -> PublicSystemStatusResponse:
    return get_public_system_status_service(db)
