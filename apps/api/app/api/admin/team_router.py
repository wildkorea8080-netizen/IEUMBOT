"""기관 관리자 팀 관리 라우트 — 기관관리자가 자기 기관의 co-관리자를 추가/관리.

모든 엔드포인트는 호출자의 organization_id로 스코프(다른 기관 접근 불가).
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.team import (
    TeamMemberCreateRequest,
    TeamMemberCreateResponse,
    TeamMemberItem,
    TeamMemberListResponse,
    TeamMemberResetPasswordResponse,
    TeamMemberUpdateRequest,
)
from app.services.admin.scope_service import require_institution_organization_id
from app.services.admin.team_service import (
    create_team_member_service,
    list_team_members_service,
    reset_team_member_password_service,
    update_team_member_service,
)

router = APIRouter(prefix="/team", tags=["admin-team"])


@router.get("/members", response_model=TeamMemberListResponse)
def list_team_members(
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> TeamMemberListResponse:
    organization_id = require_institution_organization_id(principal)
    return list_team_members_service(db, organization_id=organization_id)


@router.post(
    "/members",
    response_model=TeamMemberCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_team_member(
    body: TeamMemberCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> TeamMemberCreateResponse:
    organization_id = require_institution_organization_id(principal)
    row, temp_password = create_team_member_service(
        db, organization_id=organization_id, actor_admin_id=principal.admin_id, body=body
    )
    return TeamMemberCreateResponse(
        id=str(row.id), email=row.email, name=row.name, temporary_password=temp_password
    )


@router.patch("/members/{admin_id}", response_model=TeamMemberItem)
def update_team_member(
    admin_id: str,
    body: TeamMemberUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> TeamMemberItem:
    organization_id = require_institution_organization_id(principal)
    return update_team_member_service(
        db,
        organization_id=organization_id,
        actor_admin_id=principal.admin_id,
        admin_id=admin_id,
        body=body,
    )


@router.post(
    "/members/{admin_id}/reset-password",
    response_model=TeamMemberResetPasswordResponse,
)
def reset_team_member_password(
    admin_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> TeamMemberResetPasswordResponse:
    organization_id = require_institution_organization_id(principal)
    member_id, temp_password = reset_team_member_password_service(
        db, organization_id=organization_id, admin_id=admin_id
    )
    return TeamMemberResetPasswordResponse(id=member_id, temporary_password=temp_password)
