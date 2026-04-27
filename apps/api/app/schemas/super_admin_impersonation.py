from datetime import datetime

from app.schemas import ApiSchema


class SuperAdminImpersonationRequest(ApiSchema):
    reason: str


class SuperAdminImpersonationResponse(ApiSchema):
    impersonation_token: str
    organization_id: str
    expires_at: datetime
    redirect_url: str


class AdminImpersonationEndResponse(ApiSchema):
    status: str
    redirect_url: str
