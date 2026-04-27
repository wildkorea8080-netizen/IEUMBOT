from app.schemas import ApiSchema


class AdminUsageLimitStatus(ApiSchema):
    key: str
    label: str
    used: int
    limit: int | None = None
    usage_rate: float | None = None
    status: str
    status_label: str


class AdminUsageSummaryResponse(ApiSchema):
    total_conversations: int
    monthly_usage: int
    monthly_limit: int | None = None
    monthly_usage_rate: float | None = None
    active_chatbots: int
    active_widgets: int
    limits: list[AdminUsageLimitStatus]


class AdminUsageDailyItem(ApiSchema):
    date: str
    conversation_count: int


class AdminUsageDailyResponse(ApiSchema):
    range_type: str
    from_date: str
    to_date: str
    items: list[AdminUsageDailyItem]


class AdminChatbotUsageItem(ApiSchema):
    chatbot_id: str
    chatbot_name: str
    conversation_count: int
    average_response_time_ms: float | None = None
    success_rate: float | None = None
    fallback_rate: float | None = None


class AdminChatbotUsageResponse(ApiSchema):
    items: list[AdminChatbotUsageItem]

