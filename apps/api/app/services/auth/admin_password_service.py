from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.core.security import hash_password, verify_password
from app.repositories.auth.admin_auth_repository import get_active_admin_by_id
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.auth import AdminChangePasswordRequest, AdminChangePasswordResponse


def change_admin_password_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: AdminChangePasswordRequest,
) -> AdminChangePasswordResponse:
    if principal.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ADMIN_ORGANIZATION_SCOPE_REQUIRED",
        )

    admin = get_active_admin_by_id(db, principal.admin_id)
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ADMIN_NOT_FOUND_OR_DISABLED",
        )

    if not verify_password(body.current_password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CURRENT_PASSWORD_INVALID",
        )

    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="NEW_PASSWORD_MUST_DIFFER",
        )

    admin.password_hash = hash_password(body.new_password)
    admin.must_change_password = False

    create_audit_log(
        db,
        organization_id=principal.organization_id,
        admin_id=principal.admin_id,
        action="ADMIN_PASSWORD_CHANGED",
        target_type="admin",
        target_id=principal.admin_id,
        result="success",
        request_id=None,
        metadata_json={},
    )
    db.commit()
    return AdminChangePasswordResponse(success=True)
