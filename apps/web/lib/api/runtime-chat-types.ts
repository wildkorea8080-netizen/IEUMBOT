export type ChatOutcome =
  | "answered"
  | "insufficient_evidence"
  | "restricted"
  | "conflict"
  | "escalate";

export type ChatAnswerBlock = {
  text: string;
  warnings?: string[];
};

export type ChatCitation = {
  documentId?: string | null;
  documentName?: string | null;
  documentVersionId?: string | null;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  finalRank?: number | null;
  score?: number | null;
};

export type ChatRuntimeRequest = {
  chatbotId: string;
  question: string;
  normalizedQuery?: string;
  topK?: number;
};

export type ChatRuntimeTrace = {
  normalizedQuery?: string;
  retrieval?: Record<string, unknown>;
  guardrail?: Record<string, unknown>;
  llm?: {
    executed?: boolean;
    errorCode?: string | null;
  };
  messages?: {
    userMessageId?: string;
    assistantMessageId?: string;
    sessionId?: string;
  };
  [key: string]: unknown;
};

export type ChatRuntimeResponse = {
  requestId: string;
  chatbotId: string;
  outcome: ChatOutcome;
  answer: ChatAnswerBlock;
  citations: ChatCitation[];
  policyDecision: Record<string, unknown>;
  trace: ChatRuntimeTrace;
};
