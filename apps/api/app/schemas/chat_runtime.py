from typing import Literal

from pydantic import field_validator

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
