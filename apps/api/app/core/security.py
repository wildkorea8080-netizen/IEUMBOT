from datetime import UTC, datetime, timedelta

import jwt
from app.core.config import settings
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
IMPERSONATION_TOKEN_EXPIRE_MINUTES = 20


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(
    *,
    admin_id: str,
    organization_id: str | None,
    role: str,
    session_token: str | None = None,
) -> tuple[str, datetime]:
    issued_at = datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=settings.api_access_token_expire_minutes)
    payload = {
        "sub": admin_id,
        "organizationId": organization_id,
        "role": role,
        "type": "access",
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    # 동일계정 동시접속 제한 — 세션 식별자(sid). 검증 시 admin.session_token과 대조하여
    # 최신 로그인만 유효하게 만든다. None이면 클레임 미포함(하위호환).
    if session_token is not None:
        payload["sid"] = session_token
    token = jwt.encode(payload, settings.api_session_secret, algorithm="HS256")
    return token, expires_at


def create_impersonation_token(
    *,
    super_admin_id: str,
    target_organization_id: str,
    reason: str,
) -> tuple[str, datetime]:
    issued_at = datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=IMPERSONATION_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": super_admin_id,
        "organizationId": target_organization_id,
        "role": "institution_admin",
        "sourceRole": "super_admin",
        "type": "access",
        "impersonation": True,
        "impersonatedByAdminId": super_admin_id,
        "impersonationReason": reason,
        "impersonationCreatedAt": issued_at.isoformat(),
        "impersonationExpiresAt": expires_at.isoformat(),
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.api_session_secret, algorithm="HS256")
    return token, expires_at


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.api_session_secret, algorithms=["HS256"])
