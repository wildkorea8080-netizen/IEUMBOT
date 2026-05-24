export type DashboardSummaryResponse = {
  totalUsers: number;
  totalConversations: number;
  successRate: number;
  avgResponseTime: number;
};

export type DashboardUsageTrendItem = {
  date: string;
  users: number;
  messages: number;
};

export type DashboardQuestionTypeItem = {
  label: string;
  count: number;
};

export type DashboardRecentChatItem = {
  createdAt: string;
  question?: string | null;
  status: "success" | "fallback" | "escalation";
};

export type AdminQualityFallbackReasonItem = {
  reason: string;
  count: number;
};

export type AdminQualityQuestionItem = {
  createdAt: string;
  chatbotId: string;
  question?: string | null;
  answer?: string | null;
  outcome?: string | null;
  fallbackReason?: string | null;
  topScore?: number | null;
  retrievedCount?: number | null;
  usedInPromptCount?: number | null;
  llmExecuted?: boolean | null;
  citationCount: number;
  latencyMs?: number | null;
};

export type AdminQualityReportResponse = {
  totalConversations: number;
  answeredCount: number;
  fallbackCount: number;
  fallbackRate: number;
  avgLatencyMs?: number | null;
  avgTopScore?: number | null;
  avgRetrievedCount?: number | null;
  avgUsedInPromptCount?: number | null;
  llmExecutedRate: number;
  topFallbackReasons: AdminQualityFallbackReasonItem[];
  recentFailedQuestions: AdminQualityQuestionItem[];
  lowScoreQuestions: AdminQualityQuestionItem[];
  noCitationAnswers: AdminQualityQuestionItem[];
};

export type AdminKnowledgeGapItem = {
  question: string;
  count: number;
  fallbackCount: number;
  avgTopScore?: number | null;
  lastAskedAt: string;
  recommendedAction: string;
  recommendedTopic: string;
};

export type AdminKnowledgeGapResponse = {
  totalAnalyzed: number;
  fallbackQuestions: AdminKnowledgeGapItem[];
  lowScoreQuestions: AdminKnowledgeGapItem[];
  repeatedQuestions: AdminKnowledgeGapItem[];
  suggestedKnowledgeTopics: AdminKnowledgeGapItem[];
};

export type AdminRoiTopicItem = {
  topic: string;
  count: number;
};

export type AdminRoiDailyTrendItem = {
  date: string;
  answered: number;
  fallback: number;
  autoResolutionRate: number;
};

export type AdminRoiDashboardResponse = {
  totalQuestions: number;
  autoAnsweredCount: number;
  fallbackCount: number;
  autoResolutionRate: number;
  avgLatencyMs?: number | null;
  estimatedSavedMinutes: number;
  estimatedSavedCost: number;
  topAutomatedTopics: AdminRoiTopicItem[];
  topEscalatedTopics: AdminRoiTopicItem[];
  dailyTrend: AdminRoiDailyTrendItem[];
};

export type AdminDocumentItem = {
  id: string;
  chatbotId: string;
  title: string;
  status: string;
  sourceType?: string | null;
  latestVersionNumber?: number | null;
  latestVersionStatus?: string | null;
  updatedAt: string;
  createdAt: string;
};

export type AdminDocumentsResponse = {
  items: AdminDocumentItem[];
};

// ── FAQ 관리 (AI 분석 → 검토 등록) ──────────────────────────────────────────

export type FaqManagementItem = {
  id: string;
  chatbotId: string;
  question: string;
  answer: string;
  tags: string[];
  category: string | null;
  field: string | null;
  isActive: boolean;
  sortOrder: number;
  sourceStagingSessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FaqManagementListResponse = {
  items: FaqManagementItem[];
  total: number;
};

export type FaqManagementCreateRequest = {
  chatbotId: string;
  question: string;
  answer: string;
  tags?: string[];
  category?: string | null;
  field?: string | null;
};

export type FaqManagementUpdateRequest = {
  question?: string;
  answer?: string;
  tags?: string[];
  isActive?: boolean;
  sortOrder?: number;
  category?: string | null;
  field?: string | null;
};

// ── 지식 그룹 ─────────────────────────────────────────────────────────────────

export type KnowledgeSourceGroup = "file_text" | "website";
export type KnowledgeSourceType = "file" | "text" | "website";

export type KnowledgeItem = {
  id: string;
  sourceGroup: KnowledgeSourceGroup;
  sourceType: KnowledgeSourceType;
  title: string;
  category?: string | null;
  field?: string | null;
  tags: string[];
  memo?: string | null;
  summary?: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "inactive" | string;
  /** Recommended display value: accounts for stale jobs, partial embeddings, etc. */
  displayStatus?: string | null;
  /** True if this item has chunks AND embeddings and can be searched. */
  canSearch?: boolean;
  /** Human-readable warnings about indexing health (partial embeddings, stale job, etc.). */
  healthWarnings?: string[];
  sourceLabel?: string | null;
  createdAt: string;
  updatedAt: string;
  indexedAt?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  department?: string | null;
  sensitiveDetected: boolean;
  errorMessage?: string | null;
  extractedTextLength?: number | null;
  chunkCount?: number | null;
  embeddingCount?: number | null;
  lastProcessedAt?: string | null;
  fileName?: string | null;
  sourceUrl?: string | null;
  finalUrl?: string | null;
  httpStatusCode?: number | null;
  ingestionJobId?: string | null;
  ingestionStatus?: string | null;
  ingestionProgressPercent?: number | null;
  staleRecovered: boolean;
  recoveryAction?: string | null;
  reindexRequired: boolean;
  isActive: boolean;
  isWebsiteAttachment: boolean;
  parentWebsiteUrl?: string | null;
  webSourceId?: string | null;
};

export type WebSourceSyncSettings = {
  webSourceId: string;
  syncEnabled: boolean;
  syncIntervalDays: number | null;
  nextSyncAt: string | null;
  lastSyncedAt: string | null;
};

export type KnowledgeDetail = KnowledgeItem & {
  fileName?: string | null;
  url?: string | null;
  sourcePath?: string | null;
  lastIndexedAt?: string | null;
  extractionMethod?: string | null;
  crawlPageLimit?: number | null;
  crawlAllPages?: boolean;
  includeAttachments?: boolean;
  excludedPaths?: string[];
  crawledUrls?: string[];
  crawledPageCount?: number | null;
  attachmentFiles?: Array<{
    url?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    mimeType?: string | null;
    textLength?: number | null;
    extracted?: boolean | null;
    extractionMethod?: string | null;
    extractionStatus?: string | null;
    errorMessage?: string | null;
  }>;
  attachmentFileCount?: number | null;
};

export type KnowledgeListResponse = {
  items: KnowledgeItem[];
};

export type KnowledgeRuntimeDependencyItem = {
  installed: boolean;
  path?: string | null;
  detail?: string | null;
};

export type KnowledgeRuntimeStatus = {
  ocrReady: boolean;
  scannedPdfReady: boolean;
  pythonPackages: Record<string, KnowledgeRuntimeDependencyItem>;
  systemBinaries: Record<string, KnowledgeRuntimeDependencyItem>;
  notes: string[];
};

export type AdminChatbotItem = {
  id: string;
  name: string;
  status: string;
  organizationId: string;
  skipDuplicateFileReindex?: boolean;
  documentCount: number;
  websiteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminChatbotsResponse = {
  items: AdminChatbotItem[];
};

export type AdminChatbotCreateRequest = {
  name: string;
  descriptionText?: string | null;
};

export type AdminChatbotResponse = {
  id: string;
  name: string;
  status: string;
  organizationId: string;
  tone: string;
  answerLength: string;
  citationMode: string;
  webSearchEnabled: boolean;
  skipDuplicateFileReindex?: boolean;
  welcomeMessage?: string | null;
  quickReplyHints: string[];
  fallbackMessage?: string | null;
  descriptionText?: string | null;
  theme: Record<string, unknown>;
  businessHours: Record<string, unknown>;
  escalationPolicy: Record<string, unknown>;
  customInstructions?: string;
  responseFormatRules?: Array<{
    keywords: string[];
    format: "text" | "view" | "list";
    moreLink?: { title: string; url: string } | null;
  }>;
  documentCount: number;
  websiteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeTextCreateRequest = {
  chatbotId: string;
  title: string;
  content: string;
  category?: string;
  field?: string;
  tags: string[];
  memo?: string;
  effectiveDate?: string;
  department?: string;
};

export type KnowledgeWebsiteCreateRequest = {
  chatbotId: string;
  url: string;
  title: string;
  crawlPageLimit: number;
  crawlAllPages: boolean;
  includeAttachments: boolean;
  excludedPaths: string[];
  category?: string;
  field?: string;
  tags: string[];
  memo?: string;
  department?: string;
};

export type KnowledgeUpdateRequest = {
  title?: string;
  category?: string;
  field?: string;
  tags?: string[];
  memo?: string;
  effectiveDate?: string;
  expirationDate?: string;
  department?: string;
  crawlPageLimit?: number;
  crawlAllPages?: boolean;
  includeAttachments?: boolean;
  excludedPaths?: string[];
  isActive?: boolean;
};

export type AdminWidgetResponse = {
  id: string;
  chatbotId: string;
  organizationId: string;
  allowedDomains: string[];
  status: string;
  isActive: boolean;
  themeColor?: string | null;
  position?: string | null;
  launcherLabel?: string | null;
  welcomeMessage?: string | null;
  chatbotDisplayName?: string | null;
  institutionName?: string | null;
  logoUrl?: string | null;
  introMessage?: string | null;
  colorPreset?: string | null;
  launcherIcon?: string | null;
  launcherIconUrl?: string | null;
  launcherHoverMessage?: string | null;
  bannerTitle?: string | null;
  bannerDescription?: string | null;
  starterQuestions: string[];
  runtimeProvider?: string | null;
  runtimeModel?: string | null;
  runtimeSource?: string | null;
  runtimeKeyStatus?: string | null;
  runtimeKeyDetail?: string | null;
  runtimeSecretConfigured?: boolean;
  runtimeModelRecommended: boolean;
  installScript?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminWidgetIconAsset = {
  id: string;
  name: string;
  url: string;
  deletable: boolean;
};

export type AdminChatLogItem = {
  id: string;
  requestId?: string | null;
  chatbotId: string;
  createdAt: string;
  metadataJson: {
    question?: string | null;
    answer?: string | null;
    outcome?: string | null;
    citationSummary?: unknown[];
  };
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type FaqGenerateResponse = {
  knowledge_id: string;
  generated: FaqItem[];
  total: number;
};

export type FaqBulkRegisterResponse = {
  registered: number;
  failed: number;
  knowledge_ids: string[];
};

export type AdminChatLogsResponse = {
  items: AdminChatLogItem[];
};
