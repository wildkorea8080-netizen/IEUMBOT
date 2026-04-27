from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

PolicyDecisionType = Literal["allow", "insufficient_evidence", "conflict", "restricted", "escalate"]
RecommendedActionType = Literal["answer", "fallback", "ask_clarification", "escalate"]


class PreAnswerRequest(ApiSchema):
    chatbot_id: str
    question: str = Field(min_length=1, max_length=2000)
    normalized_query: str | None = None
    session_token: str | None = Field(default=None, max_length=200)
    source_url: str | None = Field(default=None, max_length=1024)
    top_k: int = Field(default=8, ge=1, le=20)


class PolicyFlags(ApiSchema):
    missing_evidence: bool
    conflict_detected: bool
    outdated_risk: bool
    restricted_topic: bool


class PolicyDecision(ApiSchema):
    decision: PolicyDecisionType
    reason: str
    flags: PolicyFlags
    recommended_action: RecommendedActionType
    safe_message: str | None = None


class RetrievedDocumentSummary(ApiSchema):
    document_id: str
    document_name: str
    document_version_id: str
    final_rank: int
    keyword_score: float
    vector_score: float
    combined_score: float
    source_type: str
    corpus_domain: str
    effective_date: str | None = None
    expiration_date: str | None = None


class PreAnswerResponse(ApiSchema):
    request_id: str
    chatbot_id: str
    normalized_query: str
    decision: PolicyDecision
    retrieved_documents: list[RetrievedDocumentSummary]
    policy_trace: dict
