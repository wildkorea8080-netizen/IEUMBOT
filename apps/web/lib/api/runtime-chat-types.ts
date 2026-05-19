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
  dynamicThreshold?: number | null;
  thresholdPassed?: boolean;
  usedInPrompt?: boolean;
  semanticEvidenceApplied?: boolean;
  semanticEvidenceReason?: string | null;
  semanticRescued?: boolean;
  overviewRescued?: boolean;
  matchedKeywords?: string[];
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
    dynamicThreshold?: number | null;
    promptChunkCount?: number | null;
    searchableChunkCount?: number | null;
    excludedChunkCountByReason?: Record<string, number>;
    scopeDiagnostics?: {
      matchedOrganizationId?: string | null;
      matchedChatbotId?: string | null;
      totalChunkCount?: number | null;
      searchableChunkCount?: number | null;
      excludedChunkCountByReason?: Record<string, number>;
      includeInactive?: boolean;
      [key: string]: unknown;
    } | null;
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
  followUpQuestions?: string[];
  followUpSource?: string;
  exceptionType?: string | null;
  exceptionMessage?: string | null;
  messages?: {
    userMessageId?: string;
    assistantMessageId?: string;
    sessionId?: string;
  };
  [key: string]: unknown;
};

export type PerformanceMetrics = {
  intentClassifyMs?: number | null;
  queryRewriteMs?: number | null;
  retrievalMs?: number | null;
  rerankMs?: number | null;
  apiFetchMs?: number | null;
  llmMs?: number | null;
  totalMs?: number | null;
};

export type ChunkDetail = {
  chunkId: string;
  documentName: string;
  sectionTitle?: string | null;
  score: number;
  textPreview: string;
  chunkType?: string | null;
  sourceUrl?: string | null;
  reranked: boolean;
  usedInPrompt: boolean;
};

export type ConditionalAction = {
  type: "link" | "video" | "file" | "contact" | string;
  label: string;
  value: string;
  description?: string;
};

export type ChatRuntimeResponse = {
  requestId: string;
  chatbotId: string;
  outcome: ChatOutcome;
  answer: ChatAnswerBlock;
  citations: ChatCitation[];
  followUpQuestions: string[];
  policyDecision: Record<string, unknown>;
  trace: ChatRuntimeTrace;
  conditionalActions?: ConditionalAction[];
  performance?: PerformanceMetrics;
  detailedChunks?: ChunkDetail[];
};
