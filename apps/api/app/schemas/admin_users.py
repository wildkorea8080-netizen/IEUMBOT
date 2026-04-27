from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

EndUserRole = Literal["user"]
EndUserStatus = Literal["active", "inactive"]


class AdminUserItem(ApiSchema):
    id: str
    email: str
    role: EndUserRole
    organization_id: str
    status: EndUserStatus
    created_at: str
    updated_at: str


class AdminUsersListResponse(ApiSchema):
    items: list[AdminUserItem]


class AdminUserCreateRequest(ApiSchema):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)
    role: EndUserRole = "user"
    status: EndUserStatus = "active"


class AdminUserUpdateRequest(ApiSchema):
    email: str | None = Field(default=None, min_length=3, max_length=255)
    role: EndUserRole | None = None
    status: EndUserStatus | None = None


class AdminUserResponse(ApiSchema):
    id: str
    email: str
    role: EndUserRole
    organization_id: str
    status: EndUserStatus
    created_at: str
    updated_at: str
