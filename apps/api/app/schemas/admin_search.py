from typing import Any, Literal

from pydantic import Field

from app.schemas import ApiSchema

RuleType = Literal["exclude", "boost", "pin"]
TargetType = Literal["document", "documentVersion", "corpus", "sourceType", "query"]
SourceType = Literal["pdf", "web", "notice"]


class AdminSearchTestRequest(ApiSchema):
    question: str = Field(min_length=1, max_length=2000)
    corpus_domains: list[str] | None = None
    source_types: list[SourceType] | None = None
    top_k: int = Field(default=10, ge=1, le=50)
    include_inactive: bool = False


class RuleEffectSummary(ApiSchema):
    excluded: bool = False
    boosted: bool = False
    pinned: bool = False
    boost_value: int = 0
    reason: str | None = None


class RetrievalExplanation(ApiSchema):
    matched_keywords: list[str]
    semantic_relevance: dict[str, Any]
    corpus_priority_applied: dict[str, Any]
    document_version_priority_applied: dict[str, Any]
    recency_effective_date_signal_applied: dict[str, Any]
    manual_rule_applied: RuleEffectSummary


class SearchTestCandidate(ApiSchema):
    document_id: str
    document_name: str
    document_version_id: str
    version_label: str | None = None
    page_number: int | None = None
    section_title: str | None = None
    corpus_domain: str
    source_type: str
    effective_date: str | None = None
    expiration_date: str | None = None
    keyword_score: float
    vector_score: float
    combined_score: float
    final_rank: int
    selected_by_rules: dict[str, Any]
    exclusion_or_boost_applied: dict[str, Any]
    explanation: RetrievalExplanation


class AdminSearchTestTrace(ApiSchema):
    original_question: str
    normalized_question: str
    expanded_terms: list[str]
    applied_filters: dict[str, Any]
    applied_rules: dict[str, Any]
    ranking_order: list[dict[str, Any]]


class AdminSearchTestResponse(ApiSchema):
    request_id: str
    chatbot_id: str
    candidates: list[SearchTestCandidate]
    trace: AdminSearchTestTrace


class SearchRuleBase(ApiSchema):
    target_type: TargetType
    document_id: str | None = None
    document_version_id: str | None = None
    corpus_domain: str | None = None
    source_type: SourceType | None = None
    query_pattern: str | None = None
    reason: str | None = Field(default=None, max_length=1000)
    is_active: bool = True
    metadata_json: dict[str, Any] | None = None


class ExcludeRuleCreateRequest(SearchRuleBase):
    target_type: TargetType = "document"


class BoostRuleCreateRequest(SearchRuleBase):
    boost_value: int = Field(ge=1, le=100)


class PinRuleCreateRequest(SearchRuleBase):
    query_pattern: str = Field(min_length=1, max_length=200)


class SearchRuleUpdateRequest(ApiSchema):
    is_active: bool | None = None
    reason: str | None = Field(default=None, max_length=1000)
    boost_value: int | None = Field(default=None, ge=1, le=100)
    query_pattern: str | None = Field(default=None, min_length=1, max_length=200)
    metadata_json: dict[str, Any] | None = None


class SearchRuleResponse(ApiSchema):
    id: str
    chatbot_id: str
    rule_type: RuleType
    target_type: str
    document_id: str | None = None
    document_version_id: str | None = None
    corpus_domain: str | None = None
    source_type: str | None = None
    query_pattern: str | None = None
    boost_value: int | None = None
    reason: str | None = None
    is_active: bool
    metadata_json: dict[str, Any]
    created_at: str
    updated_at: str


class SynonymCreateRequest(ApiSchema):
    canonical_term: str = Field(min_length=1, max_length=120)
    synonym_term: str = Field(min_length=1, max_length=120)
    is_bidirectional: bool = True
    scope: str = "global"
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool = True


class SynonymUpdateRequest(ApiSchema):
    is_active: bool | None = None
    is_bidirectional: bool | None = None
    scope: str | None = None
    notes: str | None = Field(default=None, max_length=1000)


class SynonymResponse(ApiSchema):
    id: str
    chatbot_id: str | None = None
    canonical_term: str
    synonym_term: str
    is_bidirectional: bool
    scope: str
    notes: str | None = None
    is_active: bool
    created_at: str
    updated_at: str


class SearchRulesListResponse(ApiSchema):
    rules: list[SearchRuleResponse]
    synonyms: list[SynonymResponse]
