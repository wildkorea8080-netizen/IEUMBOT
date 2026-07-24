"""기관사용자(멤버) 회원가입 — 기존 기관에 '가입 신청' 후 기관관리자 승인 대기.

기존 signup_service(새 기관 생성)와 달리, **기존 Organization에 institution_user로 합류**한다.
흐름: 가입(기관 코드 입력) → status="pending" → 이메일 인증 → 기관관리자 승인 → status="active".

로그인은 status=="active" 계정만 허용하므로, 승인 전(pending)에는 자동 차단된다.
메일 발송(SMTP)이 있어야 인증 링크가 나가므로 가용 조건은 email_service.is_configured().
"""

import logging
from datetime import UTC, datetime

from fastapi import status
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

    계정은 status="pending"으로 생성되어 기관관리자 '승인' 전에는 로그인할 수 없다.
    실질 게이트는 관리자 승인이며, 이메일 인증은 SMTP가 설정된 경우에만 부가로 진행한다
    (SMTP 미설정이어도 가입·승인 흐름은 정상 동작).
    """
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
    # SMTP가 설정된 경우에만 이메일 인증 토큰 발급 + 메일 발송.
    # 미설정이면 인증 단계를 건너뛴다(verification_token_hash=None → 로그인
    # 시 EMAIL_NOT_VERIFIED 가드에 걸리지 않음; status=pending 승인 게이트만 유지).
    email_ready = email_is_configured()
    token = _issue_verification_token(admin) if email_ready else None
    db.add(admin)
    db.commit()
    db.refresh(admin)

    sent = _send_verification_email(email=normalized_email, token=token) if token else False
    logger.info(
        "[MEMBER_SIGNUP] pending account org=%s admin=%s email_ready=%s verification_sent=%s",
        org.id,
        admin.id,
        email_ready,
        sent,
    )
    return admin, org, sent
