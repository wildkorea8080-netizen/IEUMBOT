from app.schemas import ApiSchema


class WidgetQuickAction(ApiSchema):
    id: str
    label: str
    action_type: str
    payload: str | None = None
    url: str | None = None
    display_location: str
    sort_order: int


class WidgetOperatingHours(ApiSchema):
    is_after_hours: bool
    message: str | None = None


class WidgetTheme(ApiSchema):
    primary_color: str | None = None
    text_color: str | None = None
    background_color: str | None = None
    preset: str | None = None


class WidgetBanner(ApiSchema):
    title: str | None = None
    description: str | None = None


class WidgetPublicConfigResponse(ApiSchema):
    chatbot_id: str
    chatbot_name: str
    institution_name: str | None = None
    logo_url: str | None = None
    intro_message: str | None = None
    welcome_message: str
    privacy_notice: str | None = None
    citation_mode: str
    theme: WidgetTheme
    banner: WidgetBanner
    starter_questions: list[str]
    quick_actions: list[WidgetQuickAction]
    operating_hours: WidgetOperatingHours
    runtime: dict
