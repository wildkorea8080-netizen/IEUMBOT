from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

RuleType = Literal[
    "restricted_category",
    "forbidden_phrase",
    "escalation_trigger",
    "sensitive_topic",
    "response_constraint",
]
TargetCategory = Literal[
    "legal_judgment",
    "outcome_prediction",
    "definitive_benefit_decision",
    "unsupported_amount_confirmation",
    "unsupported_deadline_confirmation",
    "insufficient_evidence",
    "conflict_detected",
    "restricted_topic_detected",
    "repeated_user_dissatisfaction",
    "after_hours_routing",
    "welfare_eligibility_judgment",
    "legal_interpretation",
    "administrative_decision_prediction",
    "risky_civic_complaint_request",
    "cautious_wording",
    "warning_notice",
    "escalation_suggestion",
    "clarification_required",
]
MatchMode = Literal["keyword_any", "contains", "exact", "context_flag"]
ActionType = Literal[
    "restricted",
    "escalate",
    "ask_clarification",
    "fallback",
    "warn",
    "require_cautious_wording",
]
Severity = Literal["low", "medium", "high", "critical"]


class GuardrailRuleBase(ApiSchema):
    rule_type: RuleType
    target_category: TargetCategory | None = None
    match_mode: MatchMode = "keyword_any"
    match_value: str | None = Field(default=None, max_length=2000)
    action_type: ActionType
    severity: Severity = "medium"
    fallback_message: str | None = Field(default=None, max_length=2000)
    escalation_message: str | None = Field(default=None, max_length=2000)
    priority: int = Field(default=100, ge=1, le=1000)
    is_active: bool = True
    metadata_json: dict | None = None


class GuardrailRuleCreateRequest(GuardrailRuleBase):
    pass


class GuardrailRuleUpdateRequest(ApiSchema):
    target_category: TargetCategory | None = None
    match_mode: MatchMode | None = None
    match_value: str | None = Field(default=None, max_length=2000)
    action_type: ActionType | None = None
    severity: Severity | None = None
    fallback_message: str | None = Field(default=None, max_length=2000)
    escalation_message: str | None = Field(default=None, max_length=2000)
    priority: int | None = Field(default=None, ge=1, le=1000)
    is_active: bool | None = None
    metadata_json: dict | None = None


class GuardrailRuleResponse(ApiSchema):
    id: str
    chatbot_id: str
    rule_type: RuleType
    target_category: str | None = None
    match_mode: MatchMode
    match_value: str | None = None
    action_type: ActionType
    severity: Severity
    fallback_message: str | None = None
    escalation_message: str | None = None
    priority: int
    is_active: bool
    metadata_json: dict
    created_at: str
    updated_at: str


class GuardrailRuleListResponse(ApiSchema):
    rules: list[GuardrailRuleResponse]
