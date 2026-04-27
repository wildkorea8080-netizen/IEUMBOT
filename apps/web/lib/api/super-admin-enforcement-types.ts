export type EnforcementPolicyType =
  | "billing_over_limit"
  | "contract_expired"
  | "api_error_spike"
  | "security_risk";

export type EnforcementAction =
  | "warn_only"
  | "suspend_chat"
  | "suspend_widget"
  | "suspend_organization"
  | "read_only";

export type AutoEnforcementPolicyItem = {
  id: string;
  policyType: EnforcementPolicyType;
  action: EnforcementAction;
  thresholdPercent?: number | null;
  errorWindowMinutes?: number | null;
  errorCountThreshold?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AutoEnforcementPolicyListResponse = {
  items: AutoEnforcementPolicyItem[];
};

export type AutoEnforcementPolicyUpdateRequest = Partial<{
  action: EnforcementAction;
  thresholdPercent: number | null;
  errorWindowMinutes: number | null;
  errorCountThreshold: number | null;
  isActive: boolean;
}>;

export type AutoEnforcementLogItem = {
  id: string;
  organizationId: string;
  chatbotId?: string | null;
  widgetId?: string | null;
  policyId: string;
  policyType: EnforcementPolicyType;
  action: EnforcementAction;
  reason: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AutoEnforcementLogListResponse = {
  items: AutoEnforcementLogItem[];
};

export type AutoEnforcementResolveRequest = {
  reason: string;
};
