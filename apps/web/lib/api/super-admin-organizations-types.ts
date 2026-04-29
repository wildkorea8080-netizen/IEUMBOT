export type SuperAdminOrganizationStatus = "active" | "suspended" | "trial";

export type SuperAdminOrganizationListItem = {
  id: string;
  name: string;
  code: string;
  status: SuperAdminOrganizationStatus;
  primaryDomain?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  chatbotCount: number;
  contractStatus?: string | null;
  createdAt: string;
};

export type SuperAdminOrganizationListResponse = {
  items: SuperAdminOrganizationListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type SuperAdminOrganizationContractSummary = {
  status?: string | null;
  planName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type SuperAdminOrganizationUsageSummary = {
  monthlyConversationCount: number;
  last30DaysConversationCount: number;
};

export type SuperAdminOrganizationDetail = {
  id: string;
  name: string;
  code: string;
  status: SuperAdminOrganizationStatus;
  primaryDomain?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdAt: string;
  updatedAt: string;
  contractSummary: SuperAdminOrganizationContractSummary;
  adminCount: number;
  chatbotCount: number;
  widgetCount: number;
  recentUsageSummary: SuperAdminOrganizationUsageSummary;
};

export type SuperAdminOrganizationUpsertRequest = {
  name: string;
  code?: string;
  adminEmail?: string;
  adminName?: string;
  primaryDomain?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: SuperAdminOrganizationStatus;
};

export type SuperAdminOrganizationCreateResponse = SuperAdminOrganizationDetail & {
  adminEmail: string;
  tempPassword?: string | null;
  mustChangePassword: boolean;
};

export type SuperAdminOrganizationListParams = {
  q?: string;
  status?: SuperAdminOrganizationStatus | "all";
  page?: number;
  pageSize?: number;
};

export type SuperAdminOrganizationImpersonationRequest = {
  reason: string;
};

export type SuperAdminOrganizationImpersonationResponse = {
  impersonationToken: string;
  organizationId: string;
  expiresAt: string;
  redirectUrl: string;
};
