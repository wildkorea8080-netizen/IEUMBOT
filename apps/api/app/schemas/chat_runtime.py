from typing import Literal

from app.schemas import ApiSchema

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
    warnings: list[str] = []


class ChatRuntimeResponse(ApiSchema):
    request_id: str
    chatbot_id: str
    outcome: ChatOutcome
    answer: ChatAnswerBlock
    citations: list[ChatCitation]
    policy_decision: dict
    trace: dict
