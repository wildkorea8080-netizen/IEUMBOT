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
    fallback_message_when_insufficient_evidence: str = (
        "현재 확인 가능한 공식 근거가 부족하여 확정 안내가 어렵습니다. 담당 부서에 문의해 주세요."
    )
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


class EscalationOperatingSettings(ApiSchema):
    enable_escalation_suggestion: bool = True
    escalation_fallback_message: str = "정확한 안내를 위해 담당 부서 연결을 권장합니다."
    operating_hours_fallback_message: str = (
        "현재 운영시간이 아니므로 즉시 연결이 어렵습니다. 운영시간에 다시 문의해 주세요."
    )
    after_hours_behavior_mode: AfterHoursBehaviorMode = "show_notice"


class AnswerSettings(ApiSchema):
    prompt_instruction: PromptInstructionSettings = Field(default_factory=PromptInstructionSettings)
    answer_policy: AnswerPolicySettings = Field(default_factory=AnswerPolicySettings)
    answer_format: AnswerFormatSettings = Field(default_factory=AnswerFormatSettings)
    model_runtime: ModelRuntimeSettings = Field(default_factory=ModelRuntimeSettings)
    escalation_operating: EscalationOperatingSettings = Field(default_factory=EscalationOperatingSettings)


class AnswerSettingsUpsertRequest(ApiSchema):
    settings: AnswerSettings


class AnswerSettingsResponse(ApiSchema):
    chatbot_id: str
    settings: AnswerSettings
    defaults_applied: list[str]
    normalized: bool = True
    version: int
    updated_at: str
