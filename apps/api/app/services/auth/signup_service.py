"""이메일/비밀번호 셀프 회원가입 — 가입 · 이메일 인증 · 인증메일 재발송.

가입 시 **격리된 새 Organization + institution_admin + 무료체험 Contract**를 생성한다.
이메일 인증을 마치기 전에는 로그인이 차단된다(verification_token_hash 보유 + 미인증).
기존 발급형 계정은 verification_token_hash가 NULL이라 이 가드에 걸리지 않는다.

SIGNUP_ENABLED=false(기본)면 전체 비활성 — 기존 온보딩에 영향 없음.
"""

import hashlib
import logging
import re
import secrets
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import cache
from app.core.config import settings
from app.core.security import hash_password
from app.models.admins import Admin
from app.models.contracts import Contract
from app.models.organizations import Organization
from app.services.auth.oauth_onboarding_service import _unique_slug
from app.services.email_service import send_email

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
_RATE_WINDOW_SECONDS = 3600
_RATE_MAX = 5
_INSTITUTION_ADMIN_ROLE = "institution_admin"


def _require_enabled() -> None:
    if not settings.signup_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SIGNUP_DISABLED")


def _fail(code: str, http_status: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> None:
    raise HTTPException(status_code=http_status, detail=code)


def validate_password(password: str) -> None:
    """비밀번호 정책: 8자 이상 + 영문 대문자 · 숫자 · 특수문자 각 1자 이상."""
    if not (8 <= len(password) <= 200):
        _fail("PASSWORD_LENGTH")
    if not re.search(r"[A-Z]", password):
        _fail("PASSWORD_NEEDS_UPPERCASE")
    if not re.search(r"\d", password):
        _fail("PASSWORD_NEEDS_DIGIT")
    if not re.search(r"[^A-Za-z0-9]", password):
        _fail("PASSWORD_NEEDS_SYMBOL")


def _enforce_rate_limit(client_ip: str | None) -> None:
    if not client_ip:
        return
    key = f"signup_rate:{client_ip}"
    try:
        count = int(cache.get(key) or 0)
    except (TypeError, ValueError):
        count = 0
    if count >= _RATE_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="TOO_MANY_REQUESTS"
        )
    cache.set(key, count + 1, _RATE_WINDOW_SECONDS)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _issue_verification_token(admin: Admin) -> str:
    """원문 토큰 반환, DB에는 해시만 저장(유출 시 재사용 방지)."""
    token = secrets.token_urlsafe(32)
    admin.verification_token_hash = _hash_token(token)
    admin.verification_expires_at = datetime.now(UTC) + timedelta(
        hours=max(1, int(settings.signup_verification_ttl_hours or 24))
    )
    return token


def _send_verification_email(*, email: str, token: str) -> bool:
    base = (settings.signup_web_base_url or "").rstrip("/")
    link = f"{base}/auth/verify-email?token={token}"
    subject = "[IEUMBOT] 이메일 인증을 완료해 주세요"
    text = (
        "IEUMBOT 회원가입을 완료하려면 아래 링크에서 이메일 인증을 진행해 주세요.\n\n"
        f"{link}\n\n"
        f"링크는 {settings.signup_verification_ttl_hours}시간 동안 유효합니다.\n"
        "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다."
    )
    html = (
        '<div style="font-family:-apple-system,\'Malgun Gothic\',sans-serif;line-height:1.7;color:#1f2937">'
        "<h2 style='margin:0 0 12px'>이메일 인증</h2>"
        "<p>IEUMBOT 회원가입을 완료하려면 아래 버튼을 눌러 인증을 진행해 주세요.</p>"
        f'<p><a href="{link}" style="display:inline-block;background:#2b4acb;color:#fff;'
        'padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">이메일 인증하기</a></p>'
        f"<p style='font-size:13px;color:#6b7280'>링크가 열리지 않으면 아래 주소를 복사해 주세요:<br>{link}</p>"
        f"<p style='font-size:13px;color:#6b7280'>링크는 {settings.signup_verification_ttl_hours}시간 동안 "
        "유효하며, 본인이 요청하지 않았다면 무시하셔도 됩니다.</p></div>"
    )
    return send_email(to=email, subject=subject, text=text, html=html)


def signup_service(
    db: Session,
    *,
    email: str,
    password: str,
    terms_agreed: bool,
    client_ip: str | None = None,
) -> tuple[Admin, bool]:
    """회원가입 → (생성된 관리자, 인증메일 발송 성공 여부)."""
    _require_enabled()
    if not terms_agreed:
        _fail("TERMS_NOT_AGREED")

    normalized_email = (email or "").strip().lower()
    if not _EMAIL_RE.match(normalized_email):
        _fail("INVALID_EMAIL")
    validate_password(password or "")
    _enforce_rate_limit(client_ip)

    # 로그인은 이메일 전역 조회이므로 전역 중복을 막는다.
    existing = db.execute(
        select(Admin).where(func.lower(Admin.email) == normalized_email)
    ).scalar_one_or_none()
    if existing is not None:
        _fail("EMAIL_ALREADY_EXISTS", status.HTTP_409_CONFLICT)

    display = normalized_email.split("@")[0][:60] or "사용자"
    org = Organization(
        name=f"{display} 워크스페이스"[:200],
        slug=_unique_slug(db, display),
        status="active",
        contact_email=normalized_email,
    )
    db.add(org)
    db.flush()

    admin = Admin(
        organization_id=org.id,
        email=normalized_email,
        name=display[:120],
        role=_INSTITUTION_ADMIN_ROLE,
        status="active",
        auth_provider="local",
        password_hash=hash_password(password),
        must_change_password=False,
        terms_agreed_at=datetime.now(UTC),
    )
    token = _issue_verification_token(admin)
    db.add(admin)

    today = date.today()
    trial_end = today + timedelta(days=max(1, int(settings.signup_trial_days or 7)))
    db.add(
        Contract(
            organization_id=org.id,
            plan_id=None,
            plan_name="무료체험",
            start_date=today,
            end_date=trial_end,
            current_period_start=today,
            current_period_end=trial_end,
            billing_status="trial",
            status="active",
            chatbot_limit=1,
            monthly_conversation_limit=500,
            document_limit=50,
            website_limit=5,
            widget_limit=1,
        )
    )
    db.commit()
    db.refresh(admin)

    sent = _send_verification_email(email=normalized_email, token=token)
    logger.info(
        "[SIGNUP] new account org=%s admin=%s verification_sent=%s", org.id, admin.id, sent
    )
    return admin, sent


def verify_email_service(db: Session, *, token: str) -> Admin:
    """인증 토큰 검증 → 이메일 인증 완료 처리."""
    _require_enabled()
    cleaned = (token or "").strip()
    if not cleaned:
        _fail("INVALID_TOKEN", status.HTTP_400_BAD_REQUEST)

    admin = db.execute(
        select(Admin).where(Admin.verification_token_hash == _hash_token(cleaned))
    ).scalar_one_or_none()
    if admin is None:
        _fail("INVALID_TOKEN", status.HTTP_400_BAD_REQUEST)

    expires_at = admin.verification_expires_at
    if expires_at is not None and expires_at < datetime.now(UTC):
        _fail("TOKEN_EXPIRED", status.HTTP_400_BAD_REQUEST)

    admin.email_verified_at = datetime.now(UTC)
    admin.verification_token_hash = None
    admin.verification_expires_at = None
    db.commit()
    db.refresh(admin)
    logger.info("[SIGNUP] email verified admin=%s", admin.id)
    return admin


def resend_verification_service(
    db: Session, *, email: str, client_ip: str | None = None
) -> bool:
    """인증메일 재발송. 계정 존재 여부를 노출하지 않도록 항상 성공처럼 처리."""
    _require_enabled()
    _enforce_rate_limit(client_ip)
    normalized_email = (email or "").strip().lower()

    admin = db.execute(
        select(Admin).where(func.lower(Admin.email) == normalized_email)
    ).scalar_one_or_none()
    if admin is None or admin.email_verified_at is not None or admin.auth_provider != "local":
        return True  # 존재/상태 노출 방지

    token = _issue_verification_token(admin)
    db.commit()
    _send_verification_email(email=admin.email, token=token)
    return True
