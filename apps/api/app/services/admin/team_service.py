"""기관 관리자 팀 관리 — 기관관리자가 자기 기관의 co-관리자를 추가/관리.

모든 작업은 호출자의 organization_id로 스코프된다(다른 기관 접근 불가).
신규 관리자는 institution_admin 역할 + 임시 비밀번호 + 최초 로그인 시 변경 강제.
"""

import logging
import secrets
import string
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.admins import Admin
from app.repositories.super_admin.admins_contracts_repository import (
    create_admin,
    get_admin_by_email,
    get_admin_by_id,
    get_admin_by_org_email,
    list_admins_by_organization,
)
from app.schemas.team import (
    PendingMemberItem,
    PendingMemberListResponse,
    TeamMemberCreateRequest,
    TeamMemberItem,
    TeamMemberListResponse,
    TeamMemberUpdateRequest,
)

logger = logging.getLogger(__name__)

_INSTITUTION_USER_ROLE = "institution_user"
_PENDING_STATUS = "pending"

_INSTITUTION_ADMIN_ROLE = "institution_admin"
_ALLOWED_STATUS = {"active", "inactive"}
_TEMP_PASSWORD_ALPHABET = string.ascii_letters + string.digits + "!@#$%^&*"


def _generate_temp_password(length: int = 14) -> str:
    while True:
        password = "".join(secrets.choice(_TEMP_PASSWORD_ALPHABET) for _ in range(length))
        if (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
            and any(not c.isalnum() for c in password)
        ):
            return password


def _to_item(row: Admin) -> TeamMemberItem:
    return TeamMemberItem(
        id=str(row.id),
        email=row.email,
        name=row.name,
        role=row.role,
        status=row.status,
        must_change_password=bool(row.must_change_password),
        auth_provider=getattr(row, "auth_provider", "local") or "local",
        last_login_at=row.last_login_at,
        created_at=getattr(row, "created_at", None),
    )


def list_team_members_service(db: Session, *, organization_id: str) -> TeamMemberListResponse:
    rows = list_admins_by_organization(db, organization_id=organization_id)
    return TeamMemberListResponse(items=[_to_item(r) for r in rows])


def create_team_member_service(
    db: Session,
    *,
    organization_id: str,
    actor_admin_id: str,
    body: TeamMemberCreateRequest,
) -> tuple[Admin, str]:
    email = body.email.strip().lower()
    name = body.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ADMIN_NAME"
        )
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_EMAIL"
        )

    # 같은 기관 내 중복 + 전역 중복(다른 기관/슈퍼관리자 이메일 재사용) 차단.
    if get_admin_by_org_email(db, organization_id=organization_id, email=email) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ADMIN_EMAIL_ALREADY_EXISTS"
        )
    if get_admin_by_email(db, email=email) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ADMIN_EMAIL_ALREADY_EXISTS"
        )

    temp_password = _generate_temp_password()
    row = create_admin(
        db,
        organization_id=organization_id,
        email=email,
        name=name,
        role=_INSTITUTION_ADMIN_ROLE,
        status="active",
        password_hash=hash_password(temp_password),
        must_change_password=True,
    )
    logger.info(
        "[TEAM] member created org=%s by=%s new_admin=%s", organization_id, actor_admin_id, row.id
    )
    return row, temp_password


def _get_scoped_member(db: Session, *, organization_id: str, admin_id: str) -> Admin:
    try:
        pk = uuid.UUID(admin_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="ADMIN_NOT_FOUND"
        ) from exc
    row = get_admin_by_id(db, admin_id=str(pk))
    # 자기 기관 소속 관리자만 접근 가능(테넌트 격리).
    if row is None or str(row.organization_id) != str(organization_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ADMIN_NOT_FOUND")
    return row


def update_team_member_service(
    db: Session,
    *,
    organization_id: str,
    actor_admin_id: str,
    admin_id: str,
    body: TeamMemberUpdateRequest,
) -> TeamMemberItem:
    row = _get_scoped_member(db, organization_id=organization_id, admin_id=admin_id)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ADMIN_NAME"
            )
        row.name = name
    if body.status is not None:
        if body.status not in _ALLOWED_STATUS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_STATUS"
            )
        # 자기 자신을 비활성화해 스스로 잠기는 것 방지.
        if body.status != "active" and str(row.id) == str(actor_admin_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="CANNOT_DISABLE_SELF"
            )
        row.status = body.status
    db.commit()
    db.refresh(row)
    return _to_item(row)


def reset_team_member_password_service(
    db: Session,
    *,
    organization_id: str,
    admin_id: str,
) -> tuple[str, str]:
    row = _get_scoped_member(db, organization_id=organization_id, admin_id=admin_id)
    temp_password = _generate_temp_password()
    row.password_hash = hash_password(temp_password)
    row.must_change_password = True
    db.commit()
    return str(row.id), temp_password


# ── 기관사용자 가입 승인 (항목 1) ──────────────────────────────────────────────


def _get_scoped_pending_member(db: Session, *, organization_id: str, admin_id: str) -> Admin:
    """자기 기관 소속의 '승인 대기 기관사용자'만 반환(테넌트 격리 + 역할/상태 가드)."""
    row = _get_scoped_member(db, organization_id=organization_id, admin_id=admin_id)
    if row.role != _INSTITUTION_USER_ROLE or row.status != _PENDING_STATUS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PENDING_MEMBER_NOT_FOUND")
    return row


def list_pending_members_service(
    db: Session, *, organization_id: str
) -> PendingMemberListResponse:
    """승인 대기 중인 기관사용자 목록(이메일 인증 여부 포함)."""
    rows = [
        row
        for row in list_admins_by_organization(db, organization_id=organization_id)
        if row.role == _INSTITUTION_USER_ROLE and row.status == _PENDING_STATUS
    ]
    items = [
        PendingMemberItem(
            id=str(row.id),
            email=row.email,
            name=row.name,
            email_verified=row.email_verified_at is not None,
            requested_at=getattr(row, "created_at", None),
        )
        for row in rows
    ]
    return PendingMemberListResponse(items=items)


def approve_member_service(
    db: Session, *, organization_id: str, admin_id: str
) -> PendingMemberItem:
    """가입 신청 승인 → status="active"(로그인 가능)."""
    row = _get_scoped_pending_member(db, organization_id=organization_id, admin_id=admin_id)
    row.status = "active"
    db.commit()
    db.refresh(row)
    logger.info("[MEMBER_APPROVE] org=%s admin=%s approved", organization_id, admin_id)
    return PendingMemberItem(
        id=str(row.id),
        email=row.email,
        name=row.name,
        email_verified=row.email_verified_at is not None,
        requested_at=getattr(row, "created_at", None),
    )


def reject_member_service(db: Session, *, organization_id: str, admin_id: str) -> None:
    """가입 신청 거부 → 계정 삭제(이메일 재사용 가능하도록). 대기 계정만 삭제 가능."""
    row = _get_scoped_pending_member(db, organization_id=organization_id, admin_id=admin_id)
    db.delete(row)
    db.commit()
    logger.info("[MEMBER_REJECT] org=%s admin=%s rejected(deleted)", organization_id, admin_id)
