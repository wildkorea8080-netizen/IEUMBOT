from app.schemas import ApiSchema


class AdminInstallGuideItem(ApiSchema):
    chatbot_id: str
    chatbot_name: str
    widget_id: str | None = None
    widget_name: str | None = None
    status: str
    is_active: bool = False
    allowed_domains: list[str]
    theme_color: str | None = None
    position: str | None = None
    created_at: str | None = None
    install_script: str | None = None
    has_widget: bool = False


class AdminInstallGuideResponse(ApiSchema):
    items: list[AdminInstallGuideItem]
