from app.schemas import ApiSchema


class AdminSecuritySummaryResponse(ApiSchema):
    blocked_today: int
    fallback_today: int
    escalation_today: int
    error_today: int
    repeated_dissatisfaction_escalations_today: int = 0
    severity_counts_today: dict[str, int] = {}


class AdminSecurityEventItem(ApiSchema):
    event_id: str
    session_id: str
    chatbot_id: str
    chatbot_name: str
    time: str
    question_preview: str | None = None
    event_type: str
    event_label: str
    reason_label: str
    severity: str | None = None
    repeated_dissatisfaction: bool = False
    response_time_ms: int | None = None


class AdminSecurityEventsResponse(ApiSchema):
    items: list[AdminSecurityEventItem]
    total_count: int
    page: int
    page_size: int


class AdminSecurityEventDetailResponse(ApiSchema):
    event_id: str
    session_id: str
    chatbot_id: str
    chatbot_name: str
    user_question: str | None = None
    assistant_answer: str | None = None
    event_type: str
    event_label: str
    status: str
    time: str
    reason_label: str
    severity: str | None = None
    repeated_dissatisfaction: bool = False
    fallback_message: str | None = None
    escalated: bool
    response_time_ms: int | None = None
    advanced_analysis_url: str | None = None
