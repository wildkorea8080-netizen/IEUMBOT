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
