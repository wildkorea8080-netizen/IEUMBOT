export type SuperAdminChatbotStatus = "active" | "inactive" | "suspended";

export type SuperAdminChatbotListItem = {
  id: string;
  name: string;
  status: SuperAdminChatbotStatus;
  organizationId: string;
  documentCount: number;
  websiteCount: number;
  lastTrainedAt?: string | null;
  createdAt: string;
};

export type SuperAdminChatbotListResponse = {
  items: SuperAdminChatbotListItem[];
};

export type SuperAdminChatbotSettingsSummary = {
  answerTemplateMode?: string | null;
  citationDisplayMode?: string | null;
  disallowAnswerWithoutEvidence?: boolean | null;
  requireCitations?: boolean | null;
  modelName?: string | null;
};

export type SuperAdminChatbotDetailResponse = {
  id: string;
  name: string;
  status: SuperAdminChatbotStatus;
  organizationId: string;
  settings: SuperAdminChatbotSettingsSummary;
  documentCount: number;
  websiteCount: number;
  widgetCount: number;
  createdAt: string;
  updatedAt: string;
};
