export type BillingOveragePolicy = "block" | "allow_with_charge";
export type BillingStatus = "active" | "overdue" | "suspended";

export type BillingPlanItem = {
  id: string;
  name: string;
  description?: string | null;
  monthlyBaseFee: number;
  includedTokens: number;
  pricePer1kTokens: number;
  chatbotLimit?: number | null;
  monthlyConversationLimit?: number | null;
  overagePolicy: BillingOveragePolicy;
  isActive: boolean;
  createdAt: string;
};

export type BillingPlanListResponse = {
  items: BillingPlanItem[];
};

export type BillingPlanUpsertRequest = {
  name: string;
  description?: string | null;
  monthlyBaseFee: number;
  includedTokens: number;
  pricePer1kTokens: number;
  chatbotLimit?: number | null;
  monthlyConversationLimit?: number | null;
  overagePolicy: BillingOveragePolicy;
  isActive: boolean;
};

export type BillingSummaryItem = {
  organizationId: string;
  organizationName: string;
  contractId?: string | null;
  planId?: string | null;
  planName?: string | null;
  monthlyBaseFee: number;
  totalTokens: number;
  remainingTokens: number;
  estimatedOverageCost: number;
  totalEstimatedCharge: number;
  isOverLimit: boolean;
  billingStatus?: BillingStatus | null;
  monthlyConversationCount: number;
  monthlyConversationLimit?: number | null;
  activeChatbotCount: number;
  chatbotLimit?: number | null;
};

export type SuperAdminBillingSummary = {
  totalMonthlyRevenueEstimate: number;
  totalOverageEstimate: number;
  overLimitOrganizationCount: number;
  activeContractCount: number;
};

export type SuperAdminBillingByOrganizationResponse = {
  items: BillingSummaryItem[];
};

export type BillingAlertItem = {
  id: string;
  organizationId: string;
  contractId: string;
  level: string;
  metricKey: string;
  message: string;
  thresholdPercent?: number | null;
  currentValue: number;
  limitValue?: number | null;
  createdAt: string;
};

export type BillingAlertListResponse = {
  items: BillingAlertItem[];
};
