from app.schemas import ApiSchema


class SuperAdminChatbotListItem(ApiSchema):
    id: str
    name: str
    status: str
    organization_id: str
    organization_name: str
    document_count: int
    website_count: int
    last_trained_at: str | None = None
    created_at: str


class SuperAdminChatbotListResponse(ApiSchema):
    items: list[SuperAdminChatbotListItem]


class SuperAdminChatbotCreateRequest(ApiSchema):
    organization_id: str
    name: str
    status: str = "active"


class SuperAdminChatbotUpdateRequest(ApiSchema):
    organization_id: str | None = None
    name: str | None = None
    status: str | None = None


class SuperAdminChatbotSettingsSummary(ApiSchema):
    answer_template_mode: str | None = None
    citation_display_mode: str | None = None
    disallow_answer_without_evidence: bool | None = None
    require_citations: bool | None = None
    model_name: str | None = None


class SuperAdminChatbotDetailResponse(ApiSchema):
    id: str
    name: str
    status: str
    organization_id: str
    settings: SuperAdminChatbotSettingsSummary
    document_count: int
    website_count: int
    widget_count: int
    created_at: str
    updated_at: str


class SuperAdminWidgetListItem(ApiSchema):
    id: str
    chatbot_id: str
    organization_id: str
    allowed_domains: list[str]
    status: str
    domain: str | None = None
    is_active: bool
    theme_color: str | None = None
    position: str
    launcher_label: str | None = None
    welcome_message: str | None = None
    install_script: str | None = None
    created_at: str
    updated_at: str


class SuperAdminWidgetListResponse(ApiSchema):
    items: list[SuperAdminWidgetListItem]


class SuperAdminWidgetCreateRequest(ApiSchema):
    chatbot_id: str
    allowed_domains: list[str] | str
    theme_color: str | None = None
    launcher_label: str | None = None
    welcome_message: str | None = None
    position: str = "bottom-right"


class SuperAdminWidgetCreateResponse(ApiSchema):
    widget_id: str
    chatbot_id: str
    organization_id: str
    allowed_domains: list[str]
    status: str
    is_active: bool
    theme_color: str | None = None
    position: str
    launcher_label: str | None = None
    welcome_message: str | None = None
    install_script: str
    created_at: str
    updated_at: str


class SuperAdminWidgetDetailResponse(ApiSchema):
    id: str
    chatbot_id: str
    organization_id: str
    allowed_domains: list[str]
    status: str
    is_active: bool
    theme_color: str | None = None
    position: str
    launcher_label: str | None = None
    welcome_message: str | None = None
    install_script: str | None = None
    last_used_at: str | None = None
    created_at: str
    updated_at: str


class SuperAdminWidgetDomainsUpdateRequest(ApiSchema):
    allowed_domains: list[str]


class SuperAdminWidgetUpdateRequest(ApiSchema):
    allowed_domains: list[str] | str | None = None
    theme_color: str | None = None
    launcher_label: str | None = None
    welcome_message: str | None = None
    position: str | None = None
    is_active: bool | None = None
