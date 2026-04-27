import { apiClient } from "./client";
import type {
  EscalationCaseDetail,
  EscalationCaseFilters,
  EscalationCaseListResponse,
  EscalationRule,
  EscalationRuleCreateRequest,
  EscalationRuleListResponse,
  EscalationRuleUpdateRequest,
} from "./escalations-types";

function buildQuery(filters: EscalationCaseFilters): string {
  const params = new URLSearchParams();
  if (filters.reason) params.set("reason", filters.reason);
  if (filters.targetDepartment) params.set("targetDepartment", filters.targetDepartment);
  if (filters.targetQueue) params.set("targetQueue", filters.targetQueue);
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (typeof filters.llmExecuted === "boolean") {
    params.set("llmExecuted", String(filters.llmExecuted));
  }
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  if (typeof filters.unresolvedOnly === "boolean") {
    params.set("unresolvedOnly", String(filters.unresolvedOnly));
  }
  if (typeof filters.limit === "number") {
    params.set("limit", String(filters.limit));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listEscalationRules(chatbotId: string): Promise<EscalationRuleListResponse> {
  return apiClient.request<EscalationRuleListResponse>(`/admin/chatbots/${chatbotId}/escalation-rules`);
}

export async function createEscalationRule(
  chatbotId: string,
  body: EscalationRuleCreateRequest,
): Promise<EscalationRule> {
  return apiClient.request<EscalationRule>(`/admin/chatbots/${chatbotId}/escalation-rules`, {
    method: "POST",
    body,
  });
}

export async function patchEscalationRule(
  chatbotId: string,
  ruleId: string,
  body: EscalationRuleUpdateRequest,
): Promise<EscalationRule> {
  return apiClient.request<EscalationRule>(`/admin/chatbots/${chatbotId}/escalation-rules/${ruleId}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteEscalationRule(chatbotId: string, ruleId: string): Promise<void> {
  return apiClient.request<void>(`/admin/chatbots/${chatbotId}/escalation-rules/${ruleId}`, {
    method: "DELETE",
  });
}

export async function listEscalationCases(
  chatbotId: string,
  filters: EscalationCaseFilters = {},
): Promise<EscalationCaseListResponse> {
  return apiClient.request<EscalationCaseListResponse>(
    `/admin/chatbots/${chatbotId}/escalations${buildQuery(filters)}`,
  );
}

export async function getEscalationCaseDetail(
  chatbotId: string,
  messageId: string,
): Promise<EscalationCaseDetail> {
  return apiClient.request<EscalationCaseDetail>(`/admin/chatbots/${chatbotId}/escalations/${messageId}`);
}
