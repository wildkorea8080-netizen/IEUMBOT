import { apiClient } from "./client";
import type {
  AdminSearchTestRequest,
  AdminSearchTestResponse,
  CreateBoostRuleRequest,
  CreateExcludeRuleRequest,
  CreatePinRuleRequest,
  SearchRuleResponse,
  SearchRulesListResponse,
  SynonymRequest,
  SynonymResponse,
  SynonymUpdateRequest,
  UpdateSearchRuleRequest,
} from "./search-evidence-types";

export async function runAdminSearchTest(
  chatbotId: string,
  body: AdminSearchTestRequest,
): Promise<AdminSearchTestResponse> {
  return apiClient.request<AdminSearchTestResponse>(
    `/admin/chatbots/${chatbotId}/search/test`,
    {
      method: "POST",
      body,
    },
  );
}

export async function listSearchRules(chatbotId: string): Promise<SearchRulesListResponse> {
  return apiClient.request<SearchRulesListResponse>(`/admin/chatbots/${chatbotId}/search/rules`);
}

export async function createExcludeRule(
  chatbotId: string,
  body: CreateExcludeRuleRequest,
): Promise<SearchRuleResponse> {
  return apiClient.request<SearchRuleResponse>(
    `/admin/chatbots/${chatbotId}/search/rules/exclude`,
    {
      method: "POST",
      body,
    },
  );
}

export async function createBoostRule(
  chatbotId: string,
  body: CreateBoostRuleRequest,
): Promise<SearchRuleResponse> {
  return apiClient.request<SearchRuleResponse>(
    `/admin/chatbots/${chatbotId}/search/rules/boost`,
    {
      method: "POST",
      body,
    },
  );
}

export async function createPinRule(
  chatbotId: string,
  body: CreatePinRuleRequest,
): Promise<SearchRuleResponse> {
  return apiClient.request<SearchRuleResponse>(
    `/admin/chatbots/${chatbotId}/search/rules/pin`,
    {
      method: "POST",
      body,
    },
  );
}

export async function updateSearchRule(
  chatbotId: string,
  ruleId: string,
  body: UpdateSearchRuleRequest,
): Promise<SearchRuleResponse> {
  return apiClient.request<SearchRuleResponse>(
    `/admin/chatbots/${chatbotId}/search/rules/${ruleId}`,
    {
      method: "PATCH",
      body,
    },
  );
}

export async function deleteSearchRule(chatbotId: string, ruleId: string): Promise<void> {
  return apiClient.request<void>(`/admin/chatbots/${chatbotId}/search/rules/${ruleId}`, {
    method: "DELETE",
  });
}

export async function createSynonymRule(
  chatbotId: string,
  body: SynonymRequest,
): Promise<SynonymResponse> {
  return apiClient.request<SynonymResponse>(
    `/admin/chatbots/${chatbotId}/search/rules/synonyms`,
    {
      method: "POST",
      body,
    },
  );
}

export async function updateSynonymRule(
  chatbotId: string,
  synonymId: string,
  body: SynonymUpdateRequest,
): Promise<SynonymResponse> {
  return apiClient.request<SynonymResponse>(
    `/admin/chatbots/${chatbotId}/search/rules/synonyms/${synonymId}`,
    {
      method: "PATCH",
      body,
    },
  );
}

export async function deleteSynonymRule(chatbotId: string, synonymId: string): Promise<void> {
  return apiClient.request<void>(`/admin/chatbots/${chatbotId}/search/rules/synonyms/${synonymId}`, {
    method: "DELETE",
  });
}
