from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db import get_db_session
from app.repositories.auth.admin_auth_repository import get_active_admin_by_id

bearer_scheme = HTTPBearer(auto_error=False)
SUPER_ADMIN_ROLE = "super_admin"
INSTITUTION_ADMIN_ROLE = "institution_admin"
LEGACY_INSTITUTION_ADMIN_ROLE = "admin"
# 기관사용자(제한 멤버). 승인 후 로그인 가능하나, 메뉴 접근 권한은 항목 5(RBAC)에서 부여.
INSTITUTION_USER_ROLE = "institution_user"
ALLOWED_ADMIN_ROLES = {SUPER_ADMIN_ROLE, INSTITUTION_ADMIN_ROLE, LEGACY_INSTITUTION_ADMIN_ROLE}


@dataclass
class AdminPrincipal:
    admin_id: str
    organization_id: str | None
    role: str
    source_role: str
    is_impersonating: bool = False
    impersonated_by_admin_id: str | None = None
    impersonation_reason: str | None = None
    impersonation_started_at: str | None = None
    impersonation_expires_at: str | None = None


def require_admin_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db_session),
) -> AdminPrincipal:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="UNAUTHENTICATED",
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_ACCESS_TOKEN",
        ) from exc

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_ACCESS_TOKEN_TYPE",
        )

    admin_id = payload.get("sub")
    organization_id = payload.get("organizationId")
    role = payload.get("role")
    is_impersonating = bool(payload.get("impersonation"))
    if not admin_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_ACCESS_TOKEN_PAYLOAD",
        )

    admin = get_active_admin_by_id(db, str(admin_id))
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ADMIN_NOT_FOUND_OR_DISABLED",
        )

    normalized_token_role = (
        INSTITUTION_ADMIN_ROLE if str(role) == LEGACY_INSTITUTION_ADMIN_ROLE else str(role)
    )
    normalized_source_role = (
        INSTITUTION_ADMIN_ROLE if str(admin.role) == LEGACY_INSTITUTION_ADMIN_ROLE else str(admin.role)
    )
    if normalized_token_role not in {SUPER_ADMIN_ROLE, INSTITUTION_ADMIN_ROLE}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="UNSUPPORTED_ADMIN_ROLE",
        )
    if normalized_source_role not in {SUPER_ADMIN_ROLE, INSTITUTION_ADMIN_ROLE}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="UNSUPPORTED_ADMIN_ROLE",
        )

    if is_impersonating:
        if normalized_source_role != SUPER_ADMIN_ROLE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="IMPERSONATION_SUPER_ADMIN_REQUIRED",
            )
        if normalized_token_role != INSTITUTION_ADMIN_ROLE or not organization_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="INVALID_IMPERSONATION_SCOPE",
            )
        return AdminPrincipal(
            admin_id=str(admin.id),
            organization_id=str(organization_id),
            role=INSTITUTION_ADMIN_ROLE,
            source_role=normalized_source_role,
            is_impersonating=True,
            impersonated_by_admin_id=str(payload.get("impersonatedByAdminId") or admin.id),
            impersonation_reason=(str(payload.get("impersonationReason")) if payload.get("impersonationReason") else None),
            impersonation_started_at=(
                str(payload.get("impersonationCreatedAt")) if payload.get("impersonationCreatedAt") else None
            ),
            impersonation_expires_at=(
                str(payload.get("impersonationExpiresAt")) if payload.get("impersonationExpiresAt") else None
            ),
        )

    if normalized_token_role == INSTITUTION_ADMIN_ROLE and not organization_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MISSING_ORGANIZATION_SCOPE",
        )
    if normalized_token_role == SUPER_ADMIN_ROLE:
        organization_id = None

    return AdminPrincipal(
        admin_id=str(admin.id),
        organization_id=(str(organization_id) if organization_id else None),
        role=normalized_token_role,
        source_role=normalized_source_role,
    )


def require_institution_admin_auth(
    principal: AdminPrincipal = Depends(require_admin_auth),
) -> AdminPrincipal:
    if principal.role != INSTITUTION_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="INSTITUTION_ADMIN_ROLE_REQUIRED",
        )
    return principal


def require_super_admin_auth(
    principal: AdminPrincipal = Depends(require_admin_auth),
) -> AdminPrincipal:
    if principal.role != SUPER_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SUPER_ADMIN_ROLE_REQUIRED",
        )
    return principal


def ensure_organization_scope(
    principal: AdminPrincipal,
    target_organization_id: str,
) -> None:
    """
    기관 관리자 API에서 organization scope 검증이 필요한 경우 재사용할 helper.
    - super_admin: 전체 허용
    - institution_admin: 본인 organization만 허용
    """
    if principal.role == SUPER_ADMIN_ROLE:
        return
    if principal.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ORGANIZATION_SCOPE_FORBIDDEN",
        )
    if principal.organization_id != str(target_organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ORGANIZATION_SCOPE_FORBIDDEN",
        )
