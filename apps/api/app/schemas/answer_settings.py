from typing import Literal

from pydantic import Field

from app.schemas import ApiSchema

AssistantRoleMode = Literal["civil_complaint", "policy_guide", "faq_response", "escalation_guide"]
ToneMode = Literal["polite", "formal", "plain"]
AnswerStyleMode = Literal["concise", "balanced", "detailed"]
ClarificationStrategyMode = Literal["ask_one_question", "ask_stepwise", "minimal"]
AnswerTemplateMode = Literal["fixed_public_service", "standard_structured"]
MaxAnswerLengthMode = Literal["short", "medium", "long"]
CitationDisplayMode = Literal["visible", "compact", "hidden"]
AfterHoursBehaviorMode = Literal["show_notice", "escalate_only", "allow_limited_answer"]

DEFAULT_LOW_EVIDENCE_MESSAGE = (
    "현재 등록된 자료에서는 해당 내용을 확인하기 어렵습니다. "
    "관련 사업명, 신청 단계, 또는 대상 기관을 알려주시면 다시 확인해드리겠습니다."
)
DEFAULT_ESCALATION_MESSAGE = "정확한 확인이 필요한 내용입니다. 필요하시면 담당 부서 연결을 안내해드릴 수 있습니다."
DEFAULT_AFTER_HOURS_MESSAGE = "현재 운영 시간이 아니어서 즉시 연결은 어렵습니다. 운영 시간에 다시 문의해 주세요."


class PromptInstructionSettings(ApiSchema):
    system_prompt: str = ""
    assistant_role_mode: AssistantRoleMode = "policy_guide"
    tone_mode: ToneMode = "polite"
    answer_style_mode: AnswerStyleMode = "balanced"
    additional_instructions: str = ""


class AnswerPolicySettings(ApiSchema):
    require_citations: bool = True
    disallow_answer_without_evidence: bool = True
    disallow_definitive_claims: bool = True
    disallow_outcome_prediction: bool = True
    disallow_legal_judgment: bool = True
    require_latest_source_check_warning_when_relevant: bool = True
    fallback_message_when_insufficient_evidence: str = DEFAULT_LOW_EVIDENCE_MESSAGE
    clarification_strategy_mode: ClarificationStrategyMode = "ask_one_question"


class AnswerFormatSettings(ApiSchema):
    answer_template_mode: AnswerTemplateMode = "fixed_public_service"
    max_answer_length_mode: MaxAnswerLengthMode = "medium"
    include_conclusion_section: bool = True
    include_reason_section: bool = True
    include_detailed_guidance_section: bool = True
    include_caution_section: bool = True
    citation_display_mode: CitationDisplayMode = "visible"


class ModelRuntimeSettings(ApiSchema):
    model_name: str = "gpt-4.1-mini"
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    max_tokens: int = Field(default=800, ge=128, le=4096)
    top_p: float | None = Field(default=None, ge=0.0, le=1.0)
    frequency_penalty: float | None = Field(default=None, ge=0.0, le=2.0)
    presence_penalty: float | None = Field(default=None, ge=0.0, le=2.0)


class EscalationOperatingSettings(ApiSchema):
    enable_escalation_suggestion: bool = True
    escalation_fallback_message: str = DEFAULT_ESCALATION_MESSAGE
    operating_hours_fallback_message: str = DEFAULT_AFTER_HOURS_MESSAGE
    after_hours_behavior_mode: AfterHoursBehaviorMode = "show_notice"


class RagSettings(ApiSchema):
    """RAG 검색/청킹 파라미터 설정"""

    # 검색 설정
    top_k: int = Field(default=5, ge=1, le=20)
    retrieval_threshold_document: float = Field(default=0.28, ge=0.0, le=1.0)
    retrieval_threshold_website: float = Field(default=0.25, ge=0.0, le=1.0)
    retrieval_threshold_faq: float = Field(default=0.22, ge=0.0, le=1.0)

    # 청킹 설정
    chunk_size: int = Field(default=900, ge=200, le=2000)
    chunk_overlap: int = Field(default=120, ge=0, le=500)

    # 크롤링 설정
    crawl_delay_min: float = Field(default=0.5, ge=0.0, le=5.0)
    crawl_delay_max: float = Field(default=1.5, ge=0.0, le=10.0)
    crawl_max_consecutive_failures: int = Field(default=5, ge=1, le=20)


class AnswerSettings(ApiSchema):
    prompt_instruction: PromptInstructionSettings = Field(default_factory=PromptInstructionSettings)
    answer_policy: AnswerPolicySettings = Field(default_factory=AnswerPolicySettings)
    answer_format: AnswerFormatSettings = Field(default_factory=AnswerFormatSettings)
    model_runtime: ModelRuntimeSettings = Field(default_factory=ModelRuntimeSettings)
    escalation_operating: EscalationOperatingSettings = Field(default_factory=EscalationOperatingSettings)
    rag: RagSettings = Field(default_factory=RagSettings)


class AnswerSettingsUpsertRequest(ApiSchema):
    settings: AnswerSettings


class AnswerSettingsResponse(ApiSchema):
    chatbot_id: str
    settings: AnswerSettings
    defaults_applied: list[str]
    normalized: bool = True
    version: int
    updated_at: str
