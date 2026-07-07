from pydantic import Field

from app.schemas import ApiSchema


class AdminConversationItem(ApiSchema):
    session_id: str
    chatbot_id: str
    time: str
    question_preview: str | None = None
    answer_status: str
    answer_status_label: str
    has_citations: bool
    citation_count: int = 0
    escalated: bool
    llm_executed: bool | None = None
    response_time_ms: int | None = None
    created_at: str
    latest_message_at: str | None = None
    memo: str | None = None
    status: str


class AdminConversationsListResponse(ApiSchema):
    items: list[AdminConversationItem]
    total_count: int
    page: int
    page_size: int


class AdminConversationCitationSummary(ApiSchema):
    title: str | None = None
    source_type: str | None = None
    source_url: str | None = None
    page_number: int | None = None
    section_title: str | None = None
    category: str | None = None  # 상담 분류(서울노동 상담게시판 등 주제 태깅)
    score: float | None = None  # 검색 유사도/종합 점수 (근거 신뢰성 표시용)
    final_rank: int | None = None


class AdminConversationPromptTrace(ApiSchema):
    system_prompt: str | None = None
    user_prompt: str | None = None


class AdminConversationDetailResponse(ApiSchema):
    session_id: str
    chatbot_id: str
    user_question: str | None = None
    assistant_answer: str | None = None
    answer_status: str
    answer_status_label: str
    citation_summary: list[AdminConversationCitationSummary]
    fallback_message: str | None = None
    escalation_reason: str | None = None
    escalation_target_department: str | None = None
    escalation_target_queue: str | None = None
    response_time_ms: int | None = None
    created_at: str
    updated_at: str | None = None
    memo: str | None = None
    session_status: str
    has_citations: bool
    llm_executed: bool | None = None
    advanced_analysis_url: str | None = None
    prompt_trace: AdminConversationPromptTrace | None = None


class AdminConversationUpdateRequest(ApiSchema):
    status: str | None = Field(default=None, max_length=30)
    memo: str | None = Field(default=None, max_length=2000)


class AdminSubjectStatusCount(ApiSchema):
    status: str
    label: str
    count: int


class AdminSubjectKeyword(ApiSchema):
    keyword: str
    count: int


class AdminSubjectDistributionResponse(ApiSchema):
    total_questions: int
    status_distribution: list[AdminSubjectStatusCount]
    top_keywords: list[AdminSubjectKeyword]
