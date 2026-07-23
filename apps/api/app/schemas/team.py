from datetime import datetime

from pydantic import Field

from app.schemas import ApiSchema


class TeamMemberItem(ApiSchema):
    id: str
    email: str
    name: str
    role: str
    status: str
    must_change_password: bool = False
    auth_provider: str = "local"
    last_login_at: datetime | None = None
    created_at: datetime | None = None


class TeamMemberListResponse(ApiSchema):
    items: list[TeamMemberItem]


class TeamMemberCreateRequest(ApiSchema):
    email: str = Field(min_length=3, max_length=255)
    name: str = Field(min_length=1, max_length=120)


class TeamMemberCreateResponse(ApiSchema):
    id: str
    email: str
    name: str
    # 발급 즉시 1회만 노출되는 임시 비밀번호(최초 로그인 시 변경 필요).
    temporary_password: str


class TeamMemberUpdateRequest(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    status: str | None = Field(default=None)


class TeamMemberResetPasswordResponse(ApiSchema):
    id: str
    temporary_password: str


class PendingMemberItem(ApiSchema):
    """승인 대기 중인 기관사용자(institution_user, status=pending)."""

    id: str
    email: str
    name: str
    # 이메일 인증 완료 여부 — 인증까지 마친 신청자만 실제로 대기 상태.
    email_verified: bool = False
    requested_at: datetime | None = None


class PendingMemberListResponse(ApiSchema):
    items: list[PendingMemberItem]
