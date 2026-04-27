export type ConversationOutcome =
  | "answered"
  | "insufficient_evidence"
  | "restricted"
  | "conflict"
  | "escalate"
  | "clarification"
  | "unknown";

export type RetrievalSourceSummary = {
  documentId?: string;
  documentVersionId?: string;
  rank?: number;
  score?: number;
  sourceType?: string;
  corpusDomain?: string;
};

export type CitationSummary = {
  documentId?: string;
  documentVersionId?: string;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  rank?: number | null;
};

export type ConversationTraceItem = {
  id: string;
  requestId: string;
  chatbotId?: string;
  sessionId?: string;
  createdAt: string;
  updatedAt?: string;
  question?: string;
  answer?: string;
  outcome: ConversationOutcome;
  llmExecuted?: boolean;
  llmErrorCode?: string | null;
  policyDecision?: string;
  policyReason?: string;
  flags?: Record<string, unknown>;
  guardrailMatchedRuleIds?: string[];
  guardrailFinalAction?: string;
  retrievalSummary: RetrievalSourceSummary[];
  citationSummary: CitationSummary[];
  effectiveSettingsSummary?: Record<string, unknown>;
  rawTrace?: Record<string, unknown>;
};

export type ConversationTraceResponse = {
  items: ConversationTraceItem[];
};
