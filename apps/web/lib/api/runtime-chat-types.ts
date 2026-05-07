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

export type AdminTestChatMessageOptions = {
  normalizedQuery?: string;
  topK?: number;
};

export type ChatDebugChunk = {
  chunkId?: string | null;
  knowledgeItemId?: string | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  fileName?: string | null;
  sectionTitle?: string | null;
  chunkIndex?: number | null;
  score?: number | null;
  vectorScore?: number | null;
  lexicalScore?: number | null;
  thresholdPassed?: boolean;
  usedInPrompt?: boolean;
  preview?: string | null;
};

export type ChatRuntimeTrace = {
  messageType?: "greeting" | "rag" | "clarification" | "fallback" | "error" | string;
  fallbackReason?: string;
  latencyMs?: number;
  normalizedQuery?: string;
  retrieval?: {
    enabled?: boolean;
    latencyMs?: number | null;
    retrievedCount?: number;
    usedInPromptCount?: number;
    topScore?: number | null;
    threshold?: number | null;
    sourceDiversityApplied?: boolean;
    filterScope?: {
      organizationId?: string | null;
      chatbotId?: string | null;
    } | null;
    chunks?: ChatDebugChunk[];
    [key: string]: unknown;
  };
  prompt?: {
    systemPreview?: string | null;
    contextPreview?: string | null;
    contextSourceCount?: number;
  };
  model?: {
    provider?: string | null;
    name?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    latencyMs?: number | null;
    executed?: boolean;
    errorCode?: string | null;
  };
  guardrail?: Record<string, unknown>;
  llm?: {
    executed?: boolean;
    errorCode?: string | null;
    exceptionType?: string | null;
    exceptionMessage?: string | null;
    provider?: string | null;
    model?: string | null;
    latencyMs?: number | null;
  };
  policyDecision?: Record<string, unknown>;
  exceptionType?: string | null;
  exceptionMessage?: string | null;
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
