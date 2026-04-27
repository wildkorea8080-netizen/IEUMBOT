from datetime import date
from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

OrganizationStatus = Literal["active", "suspended", "trial"]


class SuperAdminOrganizationListQuery(ApiSchema):
    query: str | None = Field(default=None, alias="q", max_length=200)
    status: OrganizationStatus | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, alias="pageSize", ge=1, le=100)


class SuperAdminOrganizationListItem(ApiSchema):
    id: str
    name: str
    code: str
    status: OrganizationStatus
    primary_domain: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    chatbot_count: int = 0
    contract_status: str | None = None
    created_at: str


class SuperAdminOrganizationListResponse(ApiSchema):
    items: list[SuperAdminOrganizationListItem]
    page: int
    page_size: int
    total: int


class SuperAdminOrganizationCreateRequest(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=2, max_length=120)
    admin_email: str = Field(min_length=3, max_length=255, alias="adminEmail")
    admin_name: str = Field(min_length=1, max_length=120, alias="adminName")
    primary_domain: str | None = Field(default=None, max_length=255)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=50)
    status: OrganizationStatus = "active"


class SuperAdminOrganizationUpdateRequest(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    primary_domain: str | None = Field(default=None, max_length=255)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=50)
    status: OrganizationStatus | None = None


class OrganizationContractSummary(ApiSchema):
    status: str | None = None
    plan_name: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class OrganizationUsageSummary(ApiSchema):
    monthly_conversation_count: int = 0
    last_30_days_conversation_count: int = 0


class SuperAdminOrganizationDetailResponse(ApiSchema):
    id: str
    name: str
    code: str
    status: OrganizationStatus
    primary_domain: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    created_at: str
    updated_at: str
    contract_summary: OrganizationContractSummary
    admin_count: int
    chatbot_count: int
    widget_count: int
    recent_usage_summary: OrganizationUsageSummary


class SuperAdminOrganizationCreateResponse(SuperAdminOrganizationDetailResponse):
    admin_email: str
    temp_password: str = Field(alias="tempPassword")
    must_change_password: bool = Field(default=True, alias="mustChangePassword")
