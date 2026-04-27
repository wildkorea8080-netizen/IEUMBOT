from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

PolicyType = Literal["billing_over_limit", "contract_expired", "api_error_spike", "security_risk"]
EnforcementAction = Literal["warn_only", "suspend_chat", "suspend_widget", "suspend_organization", "read_only"]


class AutoEnforcementPolicyItem(ApiSchema):
    id: str
    policy_type: PolicyType
    action: EnforcementAction
    threshold_percent: float | None = None
    error_window_minutes: int | None = None
    error_count_threshold: int | None = None
    is_active: bool
    created_at: str
    updated_at: str


class AutoEnforcementPolicyListResponse(ApiSchema):
    items: list[AutoEnforcementPolicyItem]


class AutoEnforcementPolicyUpdateRequest(ApiSchema):
    action: EnforcementAction | None = None
    threshold_percent: float | None = Field(default=None, ge=0)
    error_window_minutes: int | None = Field(default=None, ge=1)
    error_count_threshold: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class AutoEnforcementLogItem(ApiSchema):
    id: str
    organization_id: str
    chatbot_id: str | None = None
    widget_id: str | None = None
    policy_id: str
    policy_type: PolicyType
    action: EnforcementAction
    reason: str
    previous_status: str | None = None
    new_status: str | None = None
    resolved_at: str | None = None
    resolved_by: str | None = None
    metadata: dict = {}
    created_at: str


class AutoEnforcementLogListResponse(ApiSchema):
    items: list[AutoEnforcementLogItem]


class AutoEnforcementResolveRequest(ApiSchema):
    reason: str = Field(min_length=1, max_length=500)
