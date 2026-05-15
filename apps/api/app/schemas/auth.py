from datetime import datetime

from pydantic import Field

from app.schemas import ApiSchema


class AdminAuthLoginRequest(ApiSchema):
    email: str
    password: str


class AdminSummary(ApiSchema):
    id: str
    organization_id: str | None = None
    email: str
    name: str
    role: str
    must_change_password: bool = False
    effective_role: str | None = None
    is_impersonating: bool = False
    impersonated_by_admin_id: str | None = None
    impersonation_reason: str | None = None
    impersonation_started_at: str | None = None
    impersonation_expires_at: str | None = None


class AdminAuthLoginResponse(ApiSchema):
    access_token: str
    token_type: str = "Bearer"
    expires_at: datetime
    admin: AdminSummary


class AdminAuthMeResponse(ApiSchema):
    admin: AdminSummary


class AdminChangePasswordRequest(ApiSchema):
    current_password: str = Field(min_length=1, alias="currentPassword")
    new_password: str = Field(min_length=8, max_length=200, alias="newPassword")


class AdminChangePasswordResponse(ApiSchema):
    success: bool = True
