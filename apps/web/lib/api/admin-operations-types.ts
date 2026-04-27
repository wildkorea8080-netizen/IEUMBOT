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
  status: "processing" | "ready" | "failed" | "inactive" | string;
  sourceLabel?: string | null;
  createdAt: string;
  updatedAt: string;
  indexedAt?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  department?: string | null;
  sensitiveDetected: boolean;
  errorMessage?: string | null;
  ingestionJobId?: string | null;
  ingestionStatus?: string | null;
  ingestionProgressPercent?: number | null;
  isActive: boolean;
};

export type KnowledgeDetail = KnowledgeItem & {
  fileName?: string | null;
  url?: string | null;
  sourcePath?: string | null;
  lastIndexedAt?: string | null;
};

export type KnowledgeListResponse = {
  items: KnowledgeItem[];
};

export type AdminChatbotItem = {
  id: string;
  name: string;
  status: string;
  organizationId: string;
  documentCount: number;
  websiteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminChatbotsResponse = {
  items: AdminChatbotItem[];
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
  welcomeMessage?: string | null;
  fallbackMessage?: string | null;
  descriptionText?: string | null;
  theme: Record<string, unknown>;
  businessHours: Record<string, unknown>;
  escalationPolicy: Record<string, unknown>;
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
  installScript?: string | null;
  createdAt: string;
  updatedAt: string;
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

export type AdminChatLogsResponse = {
  items: AdminChatLogItem[];
};
