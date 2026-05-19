from typing import Annotated, Literal

from pydantic import Field, field_validator

from app.schemas import ApiSchema


# ── Tools API 구조화 응답 형식 (Sprint 3-F) ──────────────────────────────────

class MoreLink(ApiSchema):
    title: str
    url: str


class TextResponse(ApiSchema):
    type: Literal["text"] = "text"
    content: str
    more_link: MoreLink | None = None


class ViewResponse(ApiSchema):
    type: Literal["view"] = "view"
    title: str
    content: list[str] = Field(default_factory=list)
    more_link: MoreLink | None = None


class ListItem(ApiSchema):
    title: str
    contents: list[str] = Field(default_factory=list)
    source_link_path: str | None = None
    source_link_label: str | None = None
    target_link: str | None = None
    target_link_label: str | None = None
    target_link_font: str | None = None
    nav_link: str | None = None


class ListResponse(ApiSchema):
    type: Literal["list"] = "list"
    schema_type: str = "list"
    items: list[ListItem] = Field(default_factory=list)
    more_link: MoreLink | None = None


# Pydantic discriminated union — type 필드로 역직렬화 결정
StructuredResponse = Annotated[
    TextResponse | ViewResponse | ListResponse,
    Field(discriminator="type"),
]

ChatOutcome = Literal["answered", "insufficient_evidence", "restricted", "conflict", "escalate"]


class ChatCitation(ApiSchema):
    document_id: str | None = None
    document_name: str | None = None
    document_version_id: str | None = None
    page_number: int | None = None
    section_title: str | None = None
    source_type: str | None = None
    source_url: str | None = None
    final_rank: int | None = None
    score: float | None = None


class ChatAnswerBlock(ApiSchema):
    text: str
    warnings: list[str] = Field(default_factory=list)


class PerformanceMetrics(ApiSchema):
    """단계별 처리 시간 (debug_mode=True 일 때만 포함)."""
    intent_classify_ms: int | None = None
    query_rewrite_ms: int | None = None
    retrieval_ms: int | None = None
    rerank_ms: int | None = None
    api_fetch_ms: int | None = None
    llm_ms: int | None = None
    total_ms: int | None = None


class ChunkDetail(ApiSchema):
    """RAG 검색에서 활용된 청크 상세 (debug_mode=True 일 때만 포함)."""
    chunk_id: str
    document_name: str
    section_title: str | None = None
    score: float
    text_preview: str
    chunk_type: str | None = None
    source_url: str | None = None
    reranked: bool = False
    used_in_prompt: bool = True


class ChatRuntimeResponse(ApiSchema):
    request_id: str
    chatbot_id: str
    outcome: ChatOutcome
    answer: ChatAnswerBlock
    citations: list[ChatCitation]
    follow_up_questions: list[str] = Field(default_factory=list)
    policy_decision: dict
    trace: dict
    conditional_actions: list[dict] = Field(default_factory=list)
    # debug_mode=True 일 때만 포함
    performance: PerformanceMetrics = Field(default_factory=PerformanceMetrics)
    detailed_chunks: list[ChunkDetail] = Field(default_factory=list)
    # Tools API 구조화 응답 — None이면 기존 answer.text 사용
    structured_response: TextResponse | ViewResponse | ListResponse | None = None


class MessageFeedbackRequest(ApiSchema):
    feedback: int  # 1 또는 -1만 허용

    @field_validator("feedback")
    @classmethod
    def validate_feedback(cls, v: int) -> int:
        if v not in (1, -1):
            raise ValueError("feedback must be 1 or -1")
        return v


class MessageFeedbackResponse(ApiSchema):
    message_id: str
    feedback: int
    feedback_at: str  # ISO datetime string
