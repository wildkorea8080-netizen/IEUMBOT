"""SNS OAuth 셀프서비스 온보딩 — 소셜 로그인 → 계정/조직/무료체험 자동 생성.

원칙:
- 소셜 신원(provider+subject) 1개 = Admin 계정 1개. 재로그인 시 기존 계정 재사용.
- 신규 가입은 **격리된 새 Organization**의 institution_admin으로 생성 → 기존 기관 데이터
  접근 불가(테넌트 격리). 같은 이메일의 기존 로컬/타 소셜 계정과 자동 병합하지 않는다(MVP).
- 가입 즉시 org에 **N일 무료체험 Contract**를 부여(oauth_trial_days).
"""

from __future__ import annotations

import logging
import re
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.admins import Admin
from app.models.contracts import Contract
from app.models.organizations import Organization
from app.services.auth.oauth_service import OAuthUserInfo

logger = logging.getLogger(__name__)


class OnboardingError(Exception):
    """온보딩 불가(계정 정지 등). 메시지는 프론트로 전달되는 에러 코드."""


def _unique_slug(db: Session, hint: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (hint or "org").lower()).strip("-") or "org"
    base = base[:40]
    for _ in range(5):
        candidate = f"{base}-{secrets.token_hex(3)}"
        exists = db.execute(
            select(Organization.id).where(Organization.slug == candidate)
        ).first()
        if exists is None:
            return candidate
    return f"org-{uuid.uuid4().hex[:12]}"


def find_or_create_admin_from_oauth(db: Session, info: OAuthUserInfo) -> Admin:
    """소셜 신원으로 기존 계정을 찾거나, 없으면 새 조직+계정+무료체험을 생성."""
    admin = db.execute(
        select(Admin).where(
            Admin.auth_provider == info.provider,
            Admin.oauth_subject == info.subject,
        )
    ).scalar_one_or_none()

    if admin is not None:
        if admin.status != "active":
            raise OnboardingError("account_disabled")
        admin.last_login_at = datetime.now(UTC)
        db.commit()
        db.refresh(admin)
        return admin

    # ── 신규 셀프가입 → 격리된 새 조직 + 관리자 + 무료체험 계약 ──
    display = (info.name or (info.email.split("@")[0] if info.email else "") or "사용자").strip()
    email = (info.email or f"{info.provider}.{info.subject}@sns.local").strip().lower()

    org = Organization(
        name=f"{display} 워크스페이스"[:200],
        slug=_unique_slug(db, display or info.provider),
        status="active",
        contact_name=display[:120] or None,
        contact_email=(info.email or None),
    )
    db.add(org)
    db.flush()  # org.id 확보

    admin = Admin(
        organization_id=org.id,
        email=email[:255],
        name=display[:120] or "사용자",
        role="institution_admin",
        status="active",
        auth_provider=info.provider,
        oauth_subject=info.subject,
        password_hash=None,  # 소셜 계정은 비밀번호 없음
        must_change_password=False,
        last_login_at=datetime.now(UTC),
    )
    db.add(admin)

    today = date.today()
    trial_days = max(1, int(settings.oauth_trial_days or 7))
    trial_end = today + timedelta(days=trial_days)
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
            # 체험 한도(집행 연결은 Phase 2). 안전한 초기값.
            chatbot_limit=1,
            monthly_conversation_limit=500,
            document_limit=50,
            website_limit=5,
            widget_limit=1,
        )
    )

    db.commit()
    db.refresh(admin)
    logger.info(
        "[OAUTH_ONBOARD] new self-service signup provider=%s org=%s admin=%s trial_end=%s",
        info.provider, org.id, admin.id, trial_end,
    )
    return admin
