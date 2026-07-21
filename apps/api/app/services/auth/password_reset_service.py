"""비밀번호 찾기(재설정) — 재설정 메일 요청 · 토큰 검증 후 새 비밀번호 설정.

원칙:
- 요청 응답은 계정 존재 여부와 무관하게 항상 동일(계정 열거 공격 방지).
- 토큰은 해시(sha256)로만 저장, 짧은 TTL(기본 2시간), 사용 즉시 폐기.
- 소셜(OAuth) 전용 계정은 비밀번호가 없으므로 대상에서 제외.
- 회원가입 활성화 여부와 무관하게 동작(발급형 계정도 비밀번호를 잊을 수 있음).
  단, 메일 발송은 SMTP 설정이 있어야 실제로 나간다.
"""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import cache
from app.core.config import settings
from app.core.security import hash_password
from app.models.admins import Admin
from app.services.auth.signup_service import validate_password
from app.services.email_service import send_email

logger = logging.getLogger(__name__)

_RATE_WINDOW_SECONDS = 3600
_RATE_MAX = 5


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _enforce_rate_limit(client_ip: str | None) -> None:
    if not client_ip:
        return
    key = f"pwreset_rate:{client_ip}"
    try:
        count = int(cache.get(key) or 0)
    except (TypeError, ValueError):
        count = 0
    if count >= _RATE_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="TOO_MANY_REQUESTS"
        )
    cache.set(key, count + 1, _RATE_WINDOW_SECONDS)


def _send_reset_email(*, email: str, token: str) -> bool:
    base = (settings.signup_web_base_url or "").rstrip("/")
    link = f"{base}/auth/reset-password?token={token}"
    hours = max(1, int(settings.password_reset_ttl_hours or 2))
    subject = "[IEUMBOT] 비밀번호 재설정 안내"
    text = (
        "비밀번호를 재설정하려면 아래 링크를 열어 새 비밀번호를 설정해 주세요.\n\n"
        f"{link}\n\n"
        f"링크는 {hours}시간 동안 유효하며 1회만 사용할 수 있습니다.\n"
        "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다(비밀번호는 변경되지 않습니다)."
    )
    html = (
        '<div style="font-family:-apple-system,\'Malgun Gothic\',sans-serif;line-height:1.7;color:#1f2937">'
        "<h2 style='margin:0 0 12px'>비밀번호 재설정</h2>"
        "<p>아래 버튼을 눌러 새 비밀번호를 설정해 주세요.</p>"
        f'<p><a href="{link}" style="display:inline-block;background:#2b4acb;color:#fff;'
        'padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">비밀번호 재설정</a></p>'
        f"<p style='font-size:13px;color:#6b7280'>링크가 열리지 않으면 아래 주소를 복사해 주세요:<br>{link}</p>"
        f"<p style='font-size:13px;color:#6b7280'>링크는 {hours}시간 동안 유효하며 1회만 사용할 수 있습니다. "
        "본인이 요청하지 않았다면 무시하셔도 됩니다.</p></div>"
    )
    return send_email(to=email, subject=subject, text=text, html=html)


def request_password_reset_service(
    db: Session, *, email: str, client_ip: str | None = None
) -> bool:
    """재설정 메일 요청. 계정 유무와 무관하게 항상 True(존재 여부 비노출)."""
    _enforce_rate_limit(client_ip)
    normalized_email = (email or "").strip().lower()

    admin = db.execute(
        select(Admin).where(func.lower(Admin.email) == normalized_email)
    ).scalar_one_or_none()
    # 없는 계정 / 비활성 / 소셜 전용(비번 없음)은 조용히 무시
    if admin is None or admin.status != "active" or admin.auth_provider != "local":
        logger.info("[PWRESET] 요청 무시(대상 아님) email_present=%s", bool(normalized_email))
        return True

    token = secrets.token_urlsafe(32)
    admin.reset_token_hash = _hash_token(token)
    admin.reset_expires_at = datetime.now(UTC) + timedelta(
        hours=max(1, int(settings.password_reset_ttl_hours or 2))
    )
    db.commit()

    sent = _send_reset_email(email=admin.email, token=token)
    logger.info("[PWRESET] 재설정 메일 요청 admin=%s sent=%s", admin.id, sent)
    return True


def reset_password_service(db: Session, *, token: str, new_password: str) -> Admin:
    """토큰 검증 후 새 비밀번호 설정. 토큰은 1회용."""
    cleaned = (token or "").strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_TOKEN")

    admin = db.execute(
        select(Admin).where(Admin.reset_token_hash == _hash_token(cleaned))
    ).scalar_one_or_none()
    if admin is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_TOKEN")

    expires_at = admin.reset_expires_at
    if expires_at is not None and expires_at < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOKEN_EXPIRED")

    validate_password(new_password or "")

    admin.password_hash = hash_password(new_password)
    admin.reset_token_hash = None
    admin.reset_expires_at = None
    admin.must_change_password = False
    # 재설정 메일을 실제로 받았다는 것은 이메일 소유가 확인된 것 → 미인증이면 인증 완료 처리.
    if admin.email_verified_at is None:
        admin.email_verified_at = datetime.now(UTC)
        admin.verification_token_hash = None
        admin.verification_expires_at = None

    db.commit()
    db.refresh(admin)
    logger.info("[PWRESET] 비밀번호 재설정 완료 admin=%s", admin.id)
    return admin
