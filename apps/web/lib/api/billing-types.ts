import type { BillingOveragePolicy, BillingPlanItem, BillingStatus } from "./super-admin-billing-types";

export type AdminBillingUsageSnapshot = {
  periodStart?: string | null;
  periodEnd?: string | null;
  totalTokens: number;
  includedTokens: number;
  remainingTokens: number;
  overageTokens: number;
  estimatedUsageCost: number;
  estimatedOverageCost: number;
  totalEstimatedCharge: number;
  isOverLimit: boolean;
  overagePolicy?: BillingOveragePolicy | null;
};

export type AdminBillingUsageResponse = {
  plan?: BillingPlanItem | null;
  contractId?: string | null;
  billingStatus?: BillingStatus | null;
  usage: AdminBillingUsageSnapshot;
  monthlyConversationCount: number;
  monthlyConversationLimit?: number | null;
  activeChatbotCount: number;
  chatbotLimit?: number | null;
};
