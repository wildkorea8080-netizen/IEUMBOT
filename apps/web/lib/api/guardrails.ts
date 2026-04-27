import { apiClient } from "./client";

export type GuardrailRule = {
  id: string;
  ruleType: string;
  targetCategory: string;
  matchMode: string;
  matchValue: string;
  actionType: string;
  severity: string;
  isActive: boolean;
  fallbackMessage?: string | null;
};

export type GuardrailsResponse = {
  rules: GuardrailRule[];
};

export async function getGuardrails(chatbotId: string): Promise<GuardrailsResponse> {
  return apiClient.request<GuardrailsResponse>(`/admin/chatbots/${chatbotId}/guardrails`);
}

export async function patchGuardrail(chatbotId: string, ruleId: string, body: {
  isActive?: boolean;
  fallbackMessage?: string;
}) {
  return apiClient.request(`/admin/chatbots/${chatbotId}/guardrails/${ruleId}`, {
    method: "PATCH",
    body,
  });
}

