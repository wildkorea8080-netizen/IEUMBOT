from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request, status
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
    request: Request,
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

    # 동일계정 동시접속 제한 — 최신 로그인 세션만 유효.
    # admin.session_token이 설정돼 있고 토큰 sid와 다르면, 이 세션은 이후의 다른
    # 로그인으로 대체된 것 → 차단. session_token이 NULL이면 미적용(하위호환).
    # 임퍼소네이션 토큰은 sid를 발급하지 않으므로 예외(항상 통과).
    if not is_impersonating and admin.session_token is not None:
        if payload.get("sid") != admin.session_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="SESSION_SUPERSEDED",
            )

    normalized_token_role = (
        INSTITUTION_ADMIN_ROLE if str(role) == LEGACY_INSTITUTION_ADMIN_ROLE else str(role)
    )
    normalized_source_role = (
        INSTITUTION_ADMIN_ROLE if str(admin.role) == LEGACY_INSTITUTION_ADMIN_ROLE else str(admin.role)
    )
    _accepted_roles = {SUPER_ADMIN_ROLE, INSTITUTION_ADMIN_ROLE, INSTITUTION_USER_ROLE}
    if normalized_token_role not in _accepted_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="UNSUPPORTED_ADMIN_ROLE",
        )
    if normalized_source_role not in _accepted_roles:
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

    # 기관 소속 역할(관리자·사용자)은 반드시 org scope가 있어야 한다.
    if normalized_token_role in {INSTITUTION_ADMIN_ROLE, INSTITUTION_USER_ROLE} and not organization_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MISSING_ORGANIZATION_SCOPE",
        )
    if normalized_token_role == SUPER_ADMIN_ROLE:
        organization_id = None

    # 기관 IP 접근제어 — 기관 역할(관리자/사용자)만, 슈퍼관리자·임퍼소네이션은 우회.
    if organization_id and normalized_token_role in {
        INSTITUTION_ADMIN_ROLE,
        INSTITUTION_USER_ROLE,
    }:
        from app.core.client_ip import get_client_ip  # noqa: PLC0415
        from app.services.admin.ip_access_service import (  # noqa: PLC0415
            enforce_org_ip_access,
        )

        enforce_org_ip_access(
            db, organization_id=str(organization_id), client_ip=get_client_ip(request)
        )

    return AdminPrincipal(
        admin_id=str(admin.id),
        organization_id=(str(organization_id) if organization_id else None),
        role=normalized_token_role,
        source_role=normalized_source_role,
    )


def require_institution_admin_auth(
    principal: AdminPrincipal = Depends(require_admin_auth),
) -> AdminPrincipal:
    """기관 스코프 접근. 기관관리자(institution_admin) + 기관사용자(institution_user) 허용.

    기관사용자의 '메뉴별' 접근 제한은 프론트엔드가 제어하며, 관리자 전용 기능
    (관리자 관리·기관 설정 쓰기 등)은 require_institution_admin_strict로 별도 차단한다.
    super_admin은 대리접속(impersonation) 시 institution_admin 역할로 들어온다.
    """
    if principal.role not in {INSTITUTION_ADMIN_ROLE, INSTITUTION_USER_ROLE}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="INSTITUTION_ADMIN_ROLE_REQUIRED",
        )
    return principal


def require_institution_admin_strict(
    principal: AdminPrincipal = Depends(require_admin_auth),
) -> AdminPrincipal:
    """기관관리자 전용(기관사용자 차단). 관리자 관리·기관 설정 등 민감 기능에 사용."""
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
