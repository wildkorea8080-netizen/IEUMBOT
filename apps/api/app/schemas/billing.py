from datetime import date
from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

OveragePolicy = Literal["block", "allow_with_charge"]
BillingStatus = Literal["active", "overdue", "suspended"]


class PlanItem(ApiSchema):
    id: str
    name: str
    description: str | None = None
    monthly_base_fee: float
    included_tokens: int
    price_per_1k_tokens: float
    chatbot_limit: int | None = None
    monthly_conversation_limit: int | None = None
    overage_policy: OveragePolicy
    is_active: bool
    created_at: str


class PlanListResponse(ApiSchema):
    items: list[PlanItem]


class PlanCreateRequest(ApiSchema):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    monthly_base_fee: float = Field(ge=0)
    included_tokens: int = Field(ge=0)
    price_per_1k_tokens: float = Field(ge=0)
    chatbot_limit: int | None = Field(default=None, ge=0)
    monthly_conversation_limit: int | None = Field(default=None, ge=0)
    overage_policy: OveragePolicy = "block"
    is_active: bool = True


class PlanUpdateRequest(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    monthly_base_fee: float | None = Field(default=None, ge=0)
    included_tokens: int | None = Field(default=None, ge=0)
    price_per_1k_tokens: float | None = Field(default=None, ge=0)
    chatbot_limit: int | None = Field(default=None, ge=0)
    monthly_conversation_limit: int | None = Field(default=None, ge=0)
    overage_policy: OveragePolicy | None = None
    is_active: bool | None = None


class BillingUsageSnapshot(ApiSchema):
    period_start: date | None = None
    period_end: date | None = None
    total_tokens: int
    included_tokens: int
    remaining_tokens: int
    overage_tokens: int
    estimated_usage_cost: float
    estimated_overage_cost: float
    total_estimated_charge: float
    is_over_limit: bool
    overage_policy: OveragePolicy | None = None


class BillingSummaryItem(ApiSchema):
    organization_id: str
    organization_name: str
    contract_id: str | None = None
    plan_id: str | None = None
    plan_name: str | None = None
    monthly_base_fee: float
    total_tokens: int
    remaining_tokens: int
    estimated_overage_cost: float
    total_estimated_charge: float
    is_over_limit: bool
    billing_status: BillingStatus | None = None
    monthly_conversation_count: int
    monthly_conversation_limit: int | None = None
    active_chatbot_count: int
    chatbot_limit: int | None = None


class SuperAdminBillingSummaryResponse(ApiSchema):
    total_monthly_revenue_estimate: float
    total_overage_estimate: float
    over_limit_organization_count: int
    active_contract_count: int


class SuperAdminBillingByOrganizationResponse(ApiSchema):
    items: list[BillingSummaryItem]


class AdminBillingUsageResponse(ApiSchema):
    plan: PlanItem | None = None
    contract_id: str | None = None
    billing_status: BillingStatus | None = None
    usage: BillingUsageSnapshot
    monthly_conversation_count: int
    monthly_conversation_limit: int | None = None
    active_chatbot_count: int
    chatbot_limit: int | None = None


class BillingAlertItem(ApiSchema):
    id: str
    organization_id: str
    contract_id: str
    level: str
    metric_key: str
    message: str
    threshold_percent: float | None = None
    current_value: float
    limit_value: float | None = None
    created_at: str


class BillingAlertListResponse(ApiSchema):
    items: list[BillingAlertItem]
