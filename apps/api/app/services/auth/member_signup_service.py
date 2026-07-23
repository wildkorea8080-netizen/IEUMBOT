"""기관사용자(멤버) 회원가입 — 기존 기관에 '가입 신청' 후 기관관리자 승인 대기.

기존 signup_service(새 기관 생성)와 달리, **기존 Organization에 institution_user로 합류**한다.
흐름: 가입(기관 코드 입력) → status="pending" → 이메일 인증 → 기관관리자 승인 → status="active".

로그인은 status=="active" 계정만 허용하므로, 승인 전(pending)에는 자동 차단된다.
메일 발송(SMTP)이 있어야 인증 링크가 나가므로 가용 조건은 email_service.is_configured().
"""

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import INSTITUTION_USER_ROLE
from app.core.security import hash_password
from app.models.admins import Admin
from app.models.organizations import Organization
from app.services.auth.signup_service import (
    _EMAIL_RE,
    _enforce_rate_limit,
    _fail,
    _issue_verification_token,
    _send_verification_email,
    validate_password,
)
from app.services.email_service import is_configured as email_is_configured

logger = logging.getLogger(__name__)

MEMBER_PENDING_STATUS = "pending"
MEMBER_REJECTED_STATUS = "rejected"


def _require_email_ready() -> None:
    # 멤버 가입은 이메일 인증이 필수 → SMTP 미설정이면 기능 자체를 비활성.
    if not email_is_configured():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="MEMBER_SIGNUP_DISABLED")


def member_signup_service(
    db: Session,
    *,
    email: str,
    password: str,
    org_code: str,
    terms_agreed: bool,
    client_ip: str | None = None,
) -> tuple[Admin, Organization, bool]:
    """기관사용자 가입 신청 → (생성된 계정, 소속 기관, 인증메일 발송 여부).

    계정은 status="pending"으로 생성되어 기관관리자 승인 전에는 로그인할 수 없다.
    """
    _require_email_ready()
    if not terms_agreed:
        _fail("TERMS_NOT_AGREED")

    normalized_email = (email or "").strip().lower()
    if not _EMAIL_RE.match(normalized_email):
        _fail("INVALID_EMAIL")
    validate_password(password or "")

    normalized_code = (org_code or "").strip().lower()
    if not normalized_code:
        _fail("ORG_CODE_REQUIRED")

    _enforce_rate_limit(client_ip)

    org = db.execute(
        select(Organization).where(func.lower(Organization.slug) == normalized_code)
    ).scalar_one_or_none()
    if org is None:
        _fail("ORG_NOT_FOUND", status.HTTP_404_NOT_FOUND)
    if org.status != "active":
        _fail("ORG_NOT_AVAILABLE", status.HTTP_409_CONFLICT)

    # 로그인은 이메일 전역 조회이므로 전역 중복을 막는다.
    existing = db.execute(
        select(Admin).where(func.lower(Admin.email) == normalized_email)
    ).scalar_one_or_none()
    if existing is not None:
        _fail("EMAIL_ALREADY_EXISTS", status.HTTP_409_CONFLICT)

    display = normalized_email.split("@")[0][:60] or "사용자"
    admin = Admin(
        organization_id=org.id,
        email=normalized_email,
        name=display[:120],
        role=INSTITUTION_USER_ROLE,
        status=MEMBER_PENDING_STATUS,
        auth_provider="local",
        password_hash=hash_password(password),
        must_change_password=False,
        terms_agreed_at=datetime.now(UTC),
    )
    token = _issue_verification_token(admin)
    db.add(admin)
    db.commit()
    db.refresh(admin)

    sent = _send_verification_email(email=normalized_email, token=token)
    logger.info(
        "[MEMBER_SIGNUP] pending account org=%s admin=%s verification_sent=%s",
        org.id,
        admin.id,
        sent,
    )
    return admin, org, sent
