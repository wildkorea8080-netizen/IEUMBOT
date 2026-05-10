export type AssistantRoleMode =
  | "civil_complaint"
  | "policy_guide"
  | "faq_response"
  | "escalation_guide";
export type ToneMode = "polite" | "formal" | "plain";
export type AnswerStyleMode = "concise" | "balanced" | "detailed";
export type ClarificationStrategyMode = "ask_one_question" | "ask_stepwise" | "minimal";
export type AnswerTemplateMode = "fixed_public_service" | "standard_structured";
export type MaxAnswerLengthMode = "short" | "medium" | "long";
export type CitationDisplayMode = "visible" | "compact" | "hidden";
export type AfterHoursBehaviorMode = "show_notice" | "escalate_only" | "allow_limited_answer";

export type PromptInstructionSettings = {
  systemPrompt: string;
  assistantRoleMode: AssistantRoleMode;
  toneMode: ToneMode;
  answerStyleMode: AnswerStyleMode;
  additionalInstructions: string;
};

export type AnswerPolicySettings = {
  requireCitations: boolean;
  disallowAnswerWithoutEvidence: boolean;
  disallowDefinitiveClaims: boolean;
  disallowOutcomePrediction: boolean;
  disallowLegalJudgment: boolean;
  requireLatestSourceCheckWarningWhenRelevant: boolean;
  fallbackMessageWhenInsufficientEvidence: string;
  clarificationStrategyMode: ClarificationStrategyMode;
};

export type AnswerFormatSettings = {
  answerTemplateMode: AnswerTemplateMode;
  maxAnswerLengthMode: MaxAnswerLengthMode;
  includeConclusionSection: boolean;
  includeReasonSection: boolean;
  includeDetailedGuidanceSection: boolean;
  includeCautionSection: boolean;
  citationDisplayMode: CitationDisplayMode;
};

export type ModelRuntimeSettings = {
  modelName: string;
  temperature: number;
  maxTokens: number;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
};

export type EscalationOperatingSettings = {
  enableEscalationSuggestion: boolean;
  escalationFallbackMessage: string;
  operatingHoursFallbackMessage: string;
  afterHoursBehaviorMode: AfterHoursBehaviorMode;
};

export interface RagSettings {
  topK: number;
  retrievalThresholdDocument: number;
  retrievalThresholdWebsite: number;
  retrievalThresholdFaq: number;
  chunkSize: number;
  chunkOverlap: number;
  crawlDelayMin: number;
  crawlDelayMax: number;
  crawlMaxConsecutiveFailures: number;
}

export type AnswerSettings = {
  promptInstruction: PromptInstructionSettings;
  answerPolicy: AnswerPolicySettings;
  answerFormat: AnswerFormatSettings;
  modelRuntime: ModelRuntimeSettings;
  escalationOperating: EscalationOperatingSettings;
  rag?: RagSettings;
};

export type AnswerSettingsResponse = {
  chatbotId: string;
  settings: AnswerSettings;
  defaultsApplied: string[];
  normalized: boolean;
  version: number;
  updatedAt: string;
};

export type AnswerSettingsUpsertRequest = {
  settings: AnswerSettings;
};
