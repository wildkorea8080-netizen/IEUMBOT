import { apiClient } from "./client";
import type {
  AutoEnforcementLogItem,
  AutoEnforcementLogListResponse,
  AutoEnforcementPolicyItem,
  AutoEnforcementPolicyListResponse,
  AutoEnforcementPolicyUpdateRequest,
  AutoEnforcementResolveRequest,
} from "./super-admin-enforcement-types";

export async function getSuperAdminEnforcementPolicies(): Promise<AutoEnforcementPolicyListResponse> {
  return apiClient.request<AutoEnforcementPolicyListResponse>("/super-admin/enforcement/policies");
}

export async function patchSuperAdminEnforcementPolicy(
  policyId: string,
  body: AutoEnforcementPolicyUpdateRequest,
): Promise<AutoEnforcementPolicyItem> {
  return apiClient.request<AutoEnforcementPolicyItem>(`/super-admin/enforcement/policies/${policyId}`, {
    method: "PATCH",
    body,
  });
}

export async function getSuperAdminEnforcementLogs(): Promise<AutoEnforcementLogListResponse> {
  return apiClient.request<AutoEnforcementLogListResponse>("/super-admin/enforcement/logs");
}

export async function resolveSuperAdminEnforcementLog(
  logId: string,
  body: AutoEnforcementResolveRequest,
): Promise<AutoEnforcementLogItem> {
  return apiClient.request<AutoEnforcementLogItem>(`/super-admin/enforcement/logs/${logId}/resolve`, {
    method: "POST",
    body,
  });
}
