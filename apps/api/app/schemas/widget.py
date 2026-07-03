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
    launcher_icon: str | None = None
    launcher_icon_url: str | None = None


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
    quick_reply_hints: list[str]
    privacy_notice: str | None = None
    citation_mode: str
    citation_presentation: str | None = None
    theme: WidgetTheme
    banner: WidgetBanner
    starter_questions: list[str]
    starter_question_style: str | None = None  # "banner" | "list" | None(자동)
    launcher_hover_message: str | None = None
    quick_actions: list[WidgetQuickAction]
    operating_hours: WidgetOperatingHours
    runtime: dict
