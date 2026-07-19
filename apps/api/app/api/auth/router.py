from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_admin_auth, require_institution_admin_auth
from app.core.security import create_access_token, verify_password
from app.db import get_db_session
from app.repositories.auth.admin_auth_repository import get_active_admin_by_email, get_active_admin_by_id
from app.schemas.auth import (
    AdminChangePasswordRequest,
    AdminChangePasswordResponse,
    AdminAuthLoginRequest,
    AdminAuthLoginResponse,
    AdminAuthMeResponse,
    AdminSummary,
)
from app.services.auth.admin_password_service import change_admin_password_service

router = APIRouter(tags=["auth"])


def _normalize_admin_role(raw_role: str) -> str:
    if raw_role == "admin":
        return "institution_admin"
    return raw_role


@router.post("/login", response_model=AdminAuthLoginResponse)
def admin_login(
    body: AdminAuthLoginRequest,
    db: Session = Depends(get_db_session),
) -> AdminAuthLoginResponse:
    normalized_email = body.email.strip().lower()
    admin = get_active_admin_by_email(db, normalized_email)

    # 소셜(OAuth) 전용 계정은 password_hash가 없음 → 비밀번호 로그인 불가(500 방지 + 우회 차단).
    if admin is None or not admin.password_hash or not verify_password(body.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_CREDENTIALS",
        )

    normalized_role = _normalize_admin_role(admin.role)

    access_token, expires_at = create_access_token(
        admin_id=str(admin.id),
        organization_id=(str(admin.organization_id) if admin.organization_id else None),
        role=normalized_role,
    )

    return AdminAuthLoginResponse(
        access_token=access_token,
        expires_at=expires_at,
        admin=AdminSummary(
            id=str(admin.id),
            organization_id=(str(admin.organization_id) if admin.organization_id else None),
            email=admin.email,
            name=admin.name,
            role=normalized_role,
            must_change_password=admin.must_change_password,
        ),
    )


@router.get("/me", response_model=AdminAuthMeResponse)
def admin_me(
    principal: AdminPrincipal = Depends(require_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminAuthMeResponse:
    admin = get_active_admin_by_id(db, principal.admin_id)
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ADMIN_NOT_FOUND_OR_DISABLED",
        )
    return AdminAuthMeResponse(
        admin=AdminSummary(
            id=str(admin.id),
            organization_id=principal.organization_id,
            email=admin.email,
            name=admin.name,
            role=principal.role,
            must_change_password=admin.must_change_password,
            effective_role=("super_admin_impersonating" if principal.is_impersonating else principal.role),
            is_impersonating=principal.is_impersonating,
            impersonated_by_admin_id=principal.impersonated_by_admin_id,
            impersonation_reason=principal.impersonation_reason,
            impersonation_started_at=principal.impersonation_started_at,
            impersonation_expires_at=principal.impersonation_expires_at,
        )
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def admin_logout(_: Response) -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/change-password", response_model=AdminChangePasswordResponse)
def admin_change_password(
    body: AdminChangePasswordRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminChangePasswordResponse:
    return change_admin_password_service(db, principal=principal, body=body)
