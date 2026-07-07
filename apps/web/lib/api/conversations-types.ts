export type AdminConversationItem = {
  sessionId: string;
  chatbotId: string;
  time: string;
  questionPreview?: string | null;
  answerStatus: string;
  answerStatusLabel: string;
  hasCitations: boolean;
  citationCount: number;
  escalated: boolean;
  llmExecuted?: boolean | null;
  responseTimeMs?: number | null;
  createdAt: string;
  latestMessageAt?: string | null;
  memo?: string | null;
  status: string;
};

export type AdminConversationsListResponse = {
  items: AdminConversationItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type AdminConversationCitationSummary = {
  title?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  category?: string | null;
  score?: number | null;
  finalRank?: number | null;
};

export type AdminConversationPromptTrace = {
  systemPrompt?: string | null;
  userPrompt?: string | null;
};

export type AdminSubjectStatusCount = { status: string; label: string; count: number };
export type AdminSubjectKeyword = { keyword: string; count: number };
export type AdminSubjectDistribution = {
  totalQuestions: number;
  statusDistribution: AdminSubjectStatusCount[];
  topKeywords: AdminSubjectKeyword[];
};

export type AdminConversationDetail = {
  sessionId: string;
  chatbotId: string;
  userQuestion?: string | null;
  assistantAnswer?: string | null;
  answerStatus: string;
  answerStatusLabel: string;
  citationSummary: AdminConversationCitationSummary[];
  fallbackMessage?: string | null;
  escalationReason?: string | null;
  escalationTargetDepartment?: string | null;
  escalationTargetQueue?: string | null;
  responseTimeMs?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  memo?: string | null;
  sessionStatus: string;
  hasCitations: boolean;
  llmExecuted?: boolean | null;
  advancedAnalysisUrl?: string | null;
  promptTrace?: AdminConversationPromptTrace | null;
};

export type AdminConversationUpdateRequest = {
  status?: string;
  memo?: string;
};
