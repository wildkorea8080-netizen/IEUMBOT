from typing import Any, Literal

from pydantic import Field

from app.schemas import ApiSchema

EscalationTriggerType = Literal[
    "insufficient_evidence",
    "restricted_topic",
    "conflict_detected",
    "after_hours",
    "repeated_dissatisfaction",
    "manual_operator_review",
]

EscalationOutcomeType = Literal[
    "answered",
    "insufficient_evidence",
    "restricted",
    "conflict",
    "escalate",
    "clarification",
]


class EscalationRuleBase(ApiSchema):
    trigger_type: EscalationTriggerType
    trigger_condition: str | None = Field(default=None, max_length=2000)
    target_department: str = Field(min_length=1, max_length=120)
    target_queue: str = Field(min_length=1, max_length=120)
    fallback_message: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=80)
    priority: int = Field(default=100, ge=1, le=1000)
    is_active: bool = True
    metadata_json: dict[str, Any] | None = None


class EscalationRuleCreateRequest(EscalationRuleBase):
    pass


class EscalationRuleUpdateRequest(ApiSchema):
    trigger_condition: str | None = Field(default=None, max_length=2000)
    target_department: str | None = Field(default=None, min_length=1, max_length=120)
    target_queue: str | None = Field(default=None, min_length=1, max_length=120)
    fallback_message: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=80)
    priority: int | None = Field(default=None, ge=1, le=1000)
    is_active: bool | None = None
    metadata_json: dict[str, Any] | None = None


class EscalationRuleResponse(ApiSchema):
    id: str
    chatbot_id: str
    trigger_type: EscalationTriggerType
    trigger_condition: str | None = None
    target_department: str
    target_queue: str
    fallback_message: str | None = None
    category: str | None = None
    priority: int
    is_active: bool
    metadata_json: dict[str, Any]
    created_at: str
    updated_at: str


class EscalationRuleListResponse(ApiSchema):
    rules: list[EscalationRuleResponse]


class EscalationCaseFilterQuery(ApiSchema):
    reason: str | None = None
    target_department: str | None = None
    target_queue: str | None = None
    outcome: EscalationOutcomeType | None = None
    llm_executed: bool | None = None
    from_date: str | None = None
    to_date: str | None = None
    unresolved_only: bool = False
    limit: int = Field(default=50, ge=1, le=200)


class EscalationCaseSummary(ApiSchema):
    message_id: str
    session_id: str
    request_id: str | None = None
    chatbot_id: str
    latest_user_question_preview: str | None = None
    escalation_reason: str | None = None
    escalation_target_department: str | None = None
    escalation_target_queue: str | None = None
    outcome: EscalationOutcomeType | None = None
    llm_executed: bool
    created_at: str


class EscalationCaseListResponse(ApiSchema):
    items: list[EscalationCaseSummary]


class EscalationConversationTurn(ApiSchema):
    role: str
    content: str
    result_type: str | None = None
    created_at: str


class EscalationCitationSummary(ApiSchema):
    document_id: str | None = None
    document_version_id: str | None = None
    title: str | None = None
    page_number: int | None = None
    section_title: str | None = None
    source_type: str | None = None
    source_url: str | None = None
    retrieval_rank: int | None = None


class EscalationCaseDetailResponse(ApiSchema):
    message_id: str
    session_id: str
    request_id: str | None = None
    chatbot_id: str
    escalation_reason: str | None = None
    escalation_target_department: str | None = None
    escalation_target_queue: str | None = None
    outcome: EscalationOutcomeType | None = None
    llm_executed: bool
    latest_user_question: str | None = None
    assistant_message: str | None = None
    policy_decision: dict[str, Any]
    matched_guardrails: list[str]
    trace_summary: dict[str, Any]
    citations: list[EscalationCitationSummary]
    conversation_summary: list[EscalationConversationTurn]
    created_at: str
    updated_at: str
