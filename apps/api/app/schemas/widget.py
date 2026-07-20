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


class WidgetTrustBadge(ApiSchema):
    """신뢰·보안 표기 뱃지 (예: ✓ 공식 등록 자료 기반 · 🔒 개인정보 자동 보호)."""

    icon: str
    label: str


class WidgetConsultationSnapshot(ApiSchema):
    """상담게시판 근거의 내부 스냅샷 — 클릭 시 참조한 상담 원문(마스킹됨)을 표시.

    게시판이 JS(POST) 방식이라 개별글 URL이 없어 딥링크가 불가하므로,
    수집 때 저장해 둔 질문/전문가답변을 정제해 보여준다.
    """

    available: bool = True
    title: str | None = None
    category: str | None = None
    question: str | None = None
    answer: str | None = None
    board_label: str | None = None
    receipt_no: str | None = None
    source_list_url: str | None = None


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
    trust_badges: list[WidgetTrustBadge] = []
    starter_questions: list[str]
    starter_question_style: str | None = None  # "banner" | "list" | None(자동)
    launcher_hover_message: str | None = None
    quick_actions: list[WidgetQuickAction]
    operating_hours: WidgetOperatingHours
    runtime: dict
