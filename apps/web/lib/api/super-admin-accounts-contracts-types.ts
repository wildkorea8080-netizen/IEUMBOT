export type SuperAdminAdminStatus = "active" | "inactive" | "disabled";
export type SuperAdminContractStatus = "active" | "trial" | "suspended" | "expired";

export type SuperAdminOrgAdminItem = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: SuperAdminAdminStatus;
  organizationId?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
};

export type SuperAdminOrgAdminResponse = SuperAdminOrgAdminItem & {
  updatedAt: string;
};

export type SuperAdminOrgAdminListResponse = {
  items: SuperAdminOrgAdminItem[];
};

export type SuperAdminOrgAdminCreateRequest = {
  email: string;
  name: string;
  temporaryPassword: string;
  status: SuperAdminAdminStatus;
};

export type SuperAdminOrgAdminUpdateRequest = {
  email?: string;
  name?: string;
  status?: SuperAdminAdminStatus;
};

export type SuperAdminAdminResetPasswordRequest = {
  temporaryPassword: string;
};

export type SuperAdminAdminResetPasswordResponse = {
  id: string;
  status: SuperAdminAdminStatus;
  updatedAt: string;
};

export type SuperAdminContractItem = {
  id: string;
  organizationId: string;
  planId?: string | null;
  planName: string;
  startDate: string;
  endDate?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  currentUsageTokens?: number;
  currentUsageCost?: number;
  isOverLimit?: boolean;
  billingStatus?: "active" | "overdue" | "suspended";
  monthlyConversationLimit?: number | null;
  documentLimit?: number | null;
  websiteLimit?: number | null;
  chatbotLimit?: number | null;
  widgetLimit?: number | null;
  status: SuperAdminContractStatus;
  createdAt: string;
};

export type SuperAdminContractResponse = SuperAdminContractItem & {
  updatedAt: string;
};

export type SuperAdminContractListResponse = {
  items: SuperAdminContractItem[];
};

export type SuperAdminContractCreateRequest = {
  organizationId?: string;
  planId?: string | null;
  planName?: string | null;
  startDate: string;
  endDate?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  monthlyConversationLimit?: number | null;
  documentLimit?: number | null;
  websiteLimit?: number | null;
  chatbotLimit?: number | null;
  widgetLimit?: number | null;
  status: SuperAdminContractStatus;
  billingStatus?: "active" | "overdue" | "suspended";
};

export type SuperAdminContractUpdateRequest = Partial<SuperAdminContractCreateRequest>;
