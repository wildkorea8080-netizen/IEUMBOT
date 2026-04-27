from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.super_admin_impersonation import AdminImpersonationEndResponse
from app.services.super_admin.impersonation_service import end_impersonation_session_service

router = APIRouter(tags=["admin-impersonation"])


@router.post("/impersonation/end", response_model=AdminImpersonationEndResponse)
def admin_end_impersonation(
    request: Request,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminImpersonationEndResponse:
    return end_impersonation_session_service(
        db,
        principal=principal,
        ip_address=(request.client.host if request.client else None),
        user_agent=request.headers.get("user-agent"),
    )
