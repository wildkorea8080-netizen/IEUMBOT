export type EscalationTriggerType =
  | "insufficient_evidence"
  | "restricted_topic"
  | "conflict_detected"
  | "after_hours"
  | "repeated_dissatisfaction"
  | "manual_operator_review";

export type EscalationOutcome =
  | "answered"
  | "insufficient_evidence"
  | "restricted"
  | "conflict"
  | "escalate"
  | "clarification";

export type EscalationRule = {
  id: string;
  chatbotId: string;
  triggerType: EscalationTriggerType;
  triggerCondition?: string | null;
  targetDepartment: string;
  targetQueue: string;
  fallbackMessage?: string | null;
  category?: string | null;
  priority: number;
  isActive: boolean;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type EscalationRuleCreateRequest = {
  triggerType: EscalationTriggerType;
  triggerCondition?: string;
  targetDepartment: string;
  targetQueue: string;
  fallbackMessage?: string;
  category?: string;
  priority?: number;
  isActive?: boolean;
  metadataJson?: Record<string, unknown>;
};

export type EscalationRuleUpdateRequest = Partial<{
  triggerCondition: string;
  targetDepartment: string;
  targetQueue: string;
  fallbackMessage: string;
  category: string;
  priority: number;
  isActive: boolean;
  metadataJson: Record<string, unknown>;
}>;

export type EscalationRuleListResponse = {
  rules: EscalationRule[];
};

export type EscalationCaseSummary = {
  messageId: string;
  sessionId: string;
  requestId?: string | null;
  chatbotId: string;
  latestUserQuestionPreview?: string | null;
  escalationReason?: string | null;
  escalationTargetDepartment?: string | null;
  escalationTargetQueue?: string | null;
  outcome?: EscalationOutcome | null;
  llmExecuted: boolean;
  createdAt: string;
};

export type EscalationCaseListResponse = {
  items: EscalationCaseSummary[];
};

export type EscalationConversationTurn = {
  role: string;
  content: string;
  resultType?: string | null;
  createdAt: string;
};

export type EscalationCitationSummary = {
  documentId?: string | null;
  documentVersionId?: string | null;
  title?: string | null;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  retrievalRank?: number | null;
};

export type EscalationCaseDetail = {
  messageId: string;
  sessionId: string;
  requestId?: string | null;
  chatbotId: string;
  escalationReason?: string | null;
  escalationTargetDepartment?: string | null;
  escalationTargetQueue?: string | null;
  outcome?: EscalationOutcome | null;
  llmExecuted: boolean;
  latestUserQuestion?: string | null;
  assistantMessage?: string | null;
  policyDecision: Record<string, unknown>;
  matchedGuardrails: string[];
  traceSummary: Record<string, unknown>;
  citations: EscalationCitationSummary[];
  conversationSummary: EscalationConversationTurn[];
  createdAt: string;
  updatedAt: string;
};

export type EscalationCaseFilters = Partial<{
  reason: string;
  targetDepartment: string;
  targetQueue: string;
  outcome: EscalationOutcome;
  llmExecuted: boolean;
  fromDate: string;
  toDate: string;
  unresolvedOnly: boolean;
  limit: number;
}>;
