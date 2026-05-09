from app.schemas import ApiSchema


class AdminDashboardResponse(ApiSchema):
    total_users: int
    total_conversations: int
    success_rate: float
    avg_response_time: float


class AdminDashboardUsageTrendItem(ApiSchema):
    date: str
    users: int
    messages: int


class AdminDashboardQuestionTypeItem(ApiSchema):
    label: str
    count: int


class AdminDashboardRecentChatItem(ApiSchema):
    created_at: str
    question: str | None = None
    status: str


class AdminQualityFallbackReasonItem(ApiSchema):
    reason: str
    count: int


class AdminQualityQuestionItem(ApiSchema):
    created_at: str
    chatbot_id: str
    question: str | None = None
    answer: str | None = None
    outcome: str | None = None
    fallback_reason: str | None = None
    top_score: float | None = None
    retrieved_count: int | None = None
    used_in_prompt_count: int | None = None
    llm_executed: bool | None = None
    citation_count: int = 0
    latency_ms: int | None = None


class AdminQualityReportResponse(ApiSchema):
    total_conversations: int
    answered_count: int
    fallback_count: int
    fallback_rate: float
    avg_latency_ms: float | None = None
    avg_top_score: float | None = None
    avg_retrieved_count: float | None = None
    avg_used_in_prompt_count: float | None = None
    llm_executed_rate: float
    top_fallback_reasons: list[AdminQualityFallbackReasonItem]
    recent_failed_questions: list[AdminQualityQuestionItem]
    low_score_questions: list[AdminQualityQuestionItem]
    no_citation_answers: list[AdminQualityQuestionItem]


class AdminKnowledgeGapItem(ApiSchema):
    question: str
    count: int
    fallback_count: int
    avg_top_score: float | None = None
    last_asked_at: str
    recommended_action: str
    recommended_topic: str


class AdminKnowledgeGapResponse(ApiSchema):
    total_analyzed: int
    fallback_questions: list[AdminKnowledgeGapItem]
    low_score_questions: list[AdminKnowledgeGapItem]
    repeated_questions: list[AdminKnowledgeGapItem]
    suggested_knowledge_topics: list[AdminKnowledgeGapItem]


class AdminRoiTopicItem(ApiSchema):
    topic: str
    count: int


class AdminRoiDailyTrendItem(ApiSchema):
    date: str
    answered: int
    fallback: int
    auto_resolution_rate: float


class AdminRoiDashboardResponse(ApiSchema):
    total_questions: int
    auto_answered_count: int
    fallback_count: int
    auto_resolution_rate: float
    avg_latency_ms: float | None = None
    estimated_saved_minutes: int
    estimated_saved_cost: int
    top_automated_topics: list[AdminRoiTopicItem]
    top_escalated_topics: list[AdminRoiTopicItem]
    daily_trend: list[AdminRoiDailyTrendItem]


class AdminDocumentItem(ApiSchema):
    id: str
    chatbot_id: str
    title: str
    status: str
    source_type: str | None = None
    latest_version_number: int | None = None
    latest_version_status: str | None = None
    updated_at: str
    created_at: str


class AdminDocumentsListResponse(ApiSchema):
    items: list[AdminDocumentItem]


class AdminDocumentUpdateRequest(ApiSchema):
    status: str


class AdminDocumentResponse(ApiSchema):
    id: str
    chatbot_id: str
    title: str
    status: str
    source_type: str | None = None
    latest_version_number: int | None = None
    latest_version_status: str | None = None
    updated_at: str
    created_at: str


class AdminChatbotItem(ApiSchema):
    id: str
    name: str
    status: str
    organization_id: str
    document_count: int
    website_count: int
    created_at: str
    updated_at: str


class AdminChatbotsListResponse(ApiSchema):
    items: list[AdminChatbotItem]


class AdminChatbotCreateRequest(ApiSchema):
    name: str
    description_text: str | None = None


class AdminChatbotUpdateRequest(ApiSchema):
    name: str | None = None
    status: str | None = None
    tone: str | None = None
    answer_length: str | None = None
    citation_mode: str | None = None
    web_search_enabled: bool | None = None
    welcome_message: str | None = None
    fallback_message: str | None = None
    description_text: str | None = None
    theme: dict | None = None
    business_hours: dict | None = None
    escalation_policy: dict | None = None


class AdminChatbotResponse(ApiSchema):
    id: str
    name: str
    status: str
    organization_id: str
    tone: str
    answer_length: str
    citation_mode: str
    web_search_enabled: bool
    welcome_message: str | None = None
    fallback_message: str | None = None
    description_text: str | None = None
    theme: dict
    business_hours: dict
    escalation_policy: dict
    document_count: int
    website_count: int
    created_at: str
    updated_at: str


class AdminWidgetResponse(ApiSchema):
    id: str
    chatbot_id: str
    organization_id: str
    allowed_domains: list[str]
    status: str
    is_active: bool
    theme_color: str | None = None
    position: str | None = None
    launcher_label: str | None = None
    welcome_message: str | None = None
    chatbot_display_name: str | None = None
    institution_name: str | None = None
    logo_url: str | None = None
    intro_message: str | None = None
    color_preset: str | None = None
    launcher_icon: str | None = None
    launcher_icon_url: str | None = None
    launcher_hover_message: str | None = None
    banner_title: str | None = None
    banner_description: str | None = None
    starter_questions: list[str] = []
    runtime_provider: str | None = None
    runtime_model: str | None = None
    runtime_source: str | None = None
    runtime_key_status: str | None = None
    runtime_key_detail: str | None = None
    runtime_secret_configured: bool = False
    runtime_model_recommended: bool = False
    install_script: str | None = None
    created_at: str
    updated_at: str


class AdminWidgetUpdateRequest(ApiSchema):
    allowed_domains: list[str] | None = None
    is_active: bool | None = None
    launcher_label: str | None = None
    theme_color: str | None = None
    welcome_message: str | None = None
    chatbot_display_name: str | None = None
    institution_name: str | None = None
    logo_url: str | None = None
    intro_message: str | None = None
    color_preset: str | None = None
    launcher_icon: str | None = None
    launcher_icon_url: str | None = None
    launcher_hover_message: str | None = None
    banner_title: str | None = None
    banner_description: str | None = None
    starter_questions: list[str] | None = None


class FeedbackSummaryResponse(ApiSchema):
    totalAssistantMessages: int
    feedbackReceived: int
    thumbsUp: int
    thumbsDown: int
    positiveRate: float


class LowRatedMessageItem(ApiSchema):
    messageId: str
    normalizedQuery: str
    content: str
    feedbackAt: str | None = None
    createdAt: str | None = None


class LowRatedMessagesResponse(ApiSchema):
    total: int
    items: list[LowRatedMessageItem]


class DocumentFeedbackItem(ApiSchema):
    documentName: str
    documentId: str | None = None
    thumbsUp: int
    thumbsDown: int
    totalFeedback: int
    positiveRate: float


class DocumentFeedbackResponse(ApiSchema):
    items: list[DocumentFeedbackItem]
