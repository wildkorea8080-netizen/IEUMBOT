import { apiClient } from "./client";

export type GuardrailRuleType =
  | "restricted_category"
  | "forbidden_phrase"
  | "escalation_trigger"
  | "sensitive_topic"
  | "response_constraint";

export type GuardrailActionType =
  | "restricted"
  | "escalate"
  | "ask_clarification"
  | "fallback"
  | "warn"
  | "require_cautious_wording";

export type GuardrailSeverity = "low" | "medium" | "high" | "critical";

export type GuardrailRule = {
  id: string;
  chatbotId: string;
  ruleType: GuardrailRuleType;
  targetCategory?: string | null;
  matchMode: string;
  matchValue?: string | null;
  actionType: GuardrailActionType;
  severity: GuardrailSeverity;
  priority: number;
  isActive: boolean;
  fallbackMessage?: string | null;
  escalationMessage?: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type GuardrailsResponse = {
  rules: GuardrailRule[];
};

export type GuardrailRuleCreateRequest = {
  ruleType: GuardrailRuleType;
  targetCategory?: string;
  matchMode?: "keyword_any" | "contains" | "exact" | "context_flag";
  matchValue?: string;
  actionType: GuardrailActionType;
  severity?: GuardrailSeverity;
  fallbackMessage?: string;
  escalationMessage?: string;
  priority?: number;
  isActive?: boolean;
  metadataJson?: Record<string, unknown>;
};

export type GuardrailRuleUpdateRequest = Partial<GuardrailRuleCreateRequest>;

export async function getGuardrails(chatbotId: string): Promise<GuardrailsResponse> {
  return apiClient.request<GuardrailsResponse>(`/admin/chatbots/${chatbotId}/guardrails`);
}

export async function createGuardrail(
  chatbotId: string,
  body: GuardrailRuleCreateRequest,
): Promise<GuardrailRule> {
  return apiClient.request<GuardrailRule>(`/admin/chatbots/${chatbotId}/guardrails`, {
    method: "POST",
    body,
  });
}

export async function patchGuardrail(
  chatbotId: string,
  ruleId: string,
  body: GuardrailRuleUpdateRequest,
): Promise<GuardrailRule> {
  return apiClient.request<GuardrailRule>(`/admin/chatbots/${chatbotId}/guardrails/${ruleId}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteGuardrail(chatbotId: string, ruleId: string): Promise<void> {
  return apiClient.request<void>(`/admin/chatbots/${chatbotId}/guardrails/${ruleId}`, {
    method: "DELETE",
  });
}
