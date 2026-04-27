from datetime import date
from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

AdminStatus = Literal["active", "inactive", "disabled"]
ContractStatus = Literal["active", "trial", "suspended", "expired"]
BillingStatus = Literal["active", "overdue", "suspended"]
OveragePolicy = Literal["block", "allow_with_charge"]


class SuperAdminOrgAdminItem(ApiSchema):
    id: str
    email: str
    name: str
    role: str
    status: AdminStatus
    organization_id: str | None = None
    must_change_password: bool = False
    last_login_at: str | None = None
    created_at: str


class SuperAdminOrgAdminListResponse(ApiSchema):
    items: list[SuperAdminOrgAdminItem]


class SuperAdminOrgAdminCreateRequest(ApiSchema):
    email: str = Field(min_length=3, max_length=255)
    name: str = Field(min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=8, max_length=200)
    temporary_password: str | None = Field(default=None, min_length=8, max_length=200, alias="temporaryPassword")
    status: AdminStatus = "active"


class SuperAdminOrgAdminUpdateRequest(ApiSchema):
    email: str | None = Field(default=None, min_length=3, max_length=255)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    status: AdminStatus | None = None


class SuperAdminOrgAdminResponse(ApiSchema):
    id: str
    email: str
    name: str
    role: str
    status: AdminStatus
    organization_id: str | None = None
    must_change_password: bool = False
    last_login_at: str | None = None
    created_at: str
    updated_at: str


class SuperAdminAdminResetPasswordRequest(ApiSchema):
    new_password: str | None = Field(default=None, min_length=8, max_length=200, alias="newPassword")
    temporary_password: str | None = Field(default=None, min_length=8, max_length=200, alias="temporaryPassword")


class SuperAdminAdminResetPasswordResponse(ApiSchema):
    id: str
    status: AdminStatus
    updated_at: str


class SuperAdminContractItem(ApiSchema):
    id: str
    organization_id: str
    plan_id: str | None = None
    plan_name: str
    start_date: date
    end_date: date | None = None
    current_period_start: date | None = None
    current_period_end: date | None = None
    current_usage_tokens: int = 0
    current_usage_cost: float = 0.0
    is_over_limit: bool = False
    billing_status: BillingStatus = "active"
    overage_policy: OveragePolicy | None = None
    monthly_conversation_limit: int | None = None
    document_limit: int | None = None
    website_limit: int | None = None
    chatbot_limit: int | None = None
    widget_limit: int | None = None
    status: ContractStatus
    created_at: str


class SuperAdminContractListResponse(ApiSchema):
    items: list[SuperAdminContractItem]


class SuperAdminContractCreateRequest(ApiSchema):
    plan_id: str | None = Field(default=None, alias="planId")
    plan_name: str | None = Field(default=None, min_length=1, max_length=80)
    start_date: date
    end_date: date | None = None
    current_period_start: date | None = Field(default=None, alias="currentPeriodStart")
    current_period_end: date | None = Field(default=None, alias="currentPeriodEnd")
    monthly_conversation_limit: int | None = Field(default=None, ge=0)
    document_limit: int | None = Field(default=None, ge=0)
    website_limit: int | None = Field(default=None, ge=0)
    chatbot_limit: int | None = Field(default=None, ge=0)
    widget_limit: int | None = Field(default=None, ge=0)
    status: ContractStatus = "active"
    billing_status: BillingStatus = Field(default="active", alias="billingStatus")


class SuperAdminContractCreateDirectRequest(SuperAdminContractCreateRequest):
    organization_id: str = Field(alias="organizationId")


class SuperAdminContractUpdateRequest(ApiSchema):
    plan_id: str | None = Field(default=None, alias="planId")
    plan_name: str | None = Field(default=None, min_length=1, max_length=80)
    start_date: date | None = None
    end_date: date | None = None
    current_period_start: date | None = Field(default=None, alias="currentPeriodStart")
    current_period_end: date | None = Field(default=None, alias="currentPeriodEnd")
    monthly_conversation_limit: int | None = Field(default=None, ge=0)
    document_limit: int | None = Field(default=None, ge=0)
    website_limit: int | None = Field(default=None, ge=0)
    chatbot_limit: int | None = Field(default=None, ge=0)
    widget_limit: int | None = Field(default=None, ge=0)
    status: ContractStatus | None = None
    billing_status: BillingStatus | None = Field(default=None, alias="billingStatus")
    is_over_limit: bool | None = Field(default=None, alias="isOverLimit")


class SuperAdminContractResponse(ApiSchema):
    id: str
    organization_id: str
    plan_id: str | None = None
    plan_name: str
    start_date: date
    end_date: date | None = None
    current_period_start: date | None = None
    current_period_end: date | None = None
    current_usage_tokens: int = 0
    current_usage_cost: float = 0.0
    is_over_limit: bool = False
    billing_status: BillingStatus = "active"
    overage_policy: OveragePolicy | None = None
    monthly_conversation_limit: int | None = None
    document_limit: int | None = None
    website_limit: int | None = None
    chatbot_limit: int | None = None
    widget_limit: int | None = None
    status: ContractStatus
    created_at: str
    updated_at: str
