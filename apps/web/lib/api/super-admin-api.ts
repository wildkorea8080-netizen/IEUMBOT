import { apiClient } from "./client";
import type {
  SuperAdminApiConfigItem,
  SuperAdminApiConfigListResponse,
  SuperAdminApiConfigUpsertRequest,
  SuperAdminApiUsageByChatbotResponse,
  SuperAdminApiUsageByOrganizationResponse,
  SuperAdminApiUsageErrorsResponse,
  SuperAdminApiUsageSummary,
} from "./super-admin-api-types";

export async function listSuperAdminApiConfigs(): Promise<SuperAdminApiConfigListResponse> {
  return apiClient.request<SuperAdminApiConfigListResponse>("/super-admin/api-configs");
}

export async function createSuperAdminApiConfig(body: SuperAdminApiConfigUpsertRequest): Promise<SuperAdminApiConfigItem> {
  return apiClient.request<SuperAdminApiConfigItem>("/super-admin/api-configs", { method: "POST", body });
}

export async function getSuperAdminApiConfig(configId: string): Promise<SuperAdminApiConfigItem> {
  return apiClient.request<SuperAdminApiConfigItem>(`/super-admin/api-configs/${configId}`);
}

export async function patchSuperAdminApiConfig(configId: string, body: Partial<SuperAdminApiConfigUpsertRequest>): Promise<SuperAdminApiConfigItem> {
  return apiClient.request<SuperAdminApiConfigItem>(`/super-admin/api-configs/${configId}`, { method: "PATCH", body });
}

export async function activateSuperAdminApiConfig(configId: string): Promise<SuperAdminApiConfigItem> {
  return apiClient.request<SuperAdminApiConfigItem>(`/super-admin/api-configs/${configId}/activate`, { method: "POST" });
}

export async function deactivateSuperAdminApiConfig(configId: string): Promise<SuperAdminApiConfigItem> {
  return apiClient.request<SuperAdminApiConfigItem>(`/super-admin/api-configs/${configId}/deactivate`, { method: "POST" });
}

export async function setDefaultSuperAdminApiConfig(configId: string): Promise<SuperAdminApiConfigItem> {
  return apiClient.request<SuperAdminApiConfigItem>(`/super-admin/api-configs/${configId}/set-default`, { method: "POST" });
}

export async function deleteSuperAdminApiConfig(configId: string): Promise<void> {
  return apiClient.request<void>(`/super-admin/api-configs/${configId}`, { method: "DELETE" });
}

export async function getSuperAdminApiUsageSummary(): Promise<SuperAdminApiUsageSummary> {
  return apiClient.request<SuperAdminApiUsageSummary>("/super-admin/api-usage/summary");
}

export async function getSuperAdminApiUsageByOrganization(): Promise<SuperAdminApiUsageByOrganizationResponse> {
  return apiClient.request<SuperAdminApiUsageByOrganizationResponse>("/super-admin/api-usage/by-organization");
}

export async function getSuperAdminApiUsageByChatbot(): Promise<SuperAdminApiUsageByChatbotResponse> {
  return apiClient.request<SuperAdminApiUsageByChatbotResponse>("/super-admin/api-usage/by-chatbot");
}

export async function getSuperAdminApiUsageErrors(): Promise<SuperAdminApiUsageErrorsResponse> {
  return apiClient.request<SuperAdminApiUsageErrorsResponse>("/super-admin/api-usage/errors");
}

