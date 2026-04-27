export type SuperAdminApiConfigItem = {
  id: string;
  provider: string;
  displayName: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  embeddingModel?: string | null;
  isActive: boolean;
  isDefault: boolean;
  maskedKey: string;
  monthlyBudgetLimit?: string | number | null;
  memo?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SuperAdminApiConfigListResponse = {
  items: SuperAdminApiConfigItem[];
};

export type SuperAdminApiConfigUpsertRequest = {
  provider: string;
  displayName: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  embeddingModel?: string;
  isActive: boolean;
  isDefault: boolean;
  monthlyBudgetLimit?: number | null;
  memo?: string;
};

export type SuperAdminApiUsageSummary = {
  totalCalls: number;
  totalTokens: number;
  estimatedCost: number;
  failedCalls: number;
  failureRate: number;
};

export type SuperAdminApiUsageByOrganizationItem = {
  organizationId: string;
  organizationName: string;
  totalCalls: number;
  totalTokens: number;
  estimatedCost: number;
  failedCalls: number;
  failureRate: number;
};

export type SuperAdminApiUsageByOrganizationResponse = {
  items: SuperAdminApiUsageByOrganizationItem[];
};

export type SuperAdminApiUsageByChatbotItem = {
  organizationId: string;
  chatbotId: string;
  chatbotName: string;
  totalCalls: number;
  totalTokens: number;
  estimatedCost: number;
  failedCalls: number;
  failureRate: number;
};

export type SuperAdminApiUsageByChatbotResponse = {
  items: SuperAdminApiUsageByChatbotItem[];
};

export type SuperAdminApiUsageErrorItem = {
  id: string;
  organizationId: string;
  organizationName: string;
  chatbotId: string;
  chatbotName: string;
  provider: string;
  model?: string | null;
  operationType: string;
  errorCode?: string | null;
  latencyMs?: number | null;
  createdAt: string;
};

export type SuperAdminApiUsageErrorsResponse = {
  items: SuperAdminApiUsageErrorItem[];
};

