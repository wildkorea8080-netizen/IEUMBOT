import { apiClient } from "./client";
import type {
  SuperAdminAdminResetPasswordRequest,
  SuperAdminAdminResetPasswordResponse,
  SuperAdminContractCreateRequest,
  SuperAdminContractListResponse,
  SuperAdminContractResponse,
  SuperAdminContractUpdateRequest,
  SuperAdminOrgAdminCreateRequest,
  SuperAdminOrgAdminListResponse,
  SuperAdminOrgAdminResponse,
  SuperAdminOrgAdminUpdateRequest,
} from "./super-admin-accounts-contracts-types";

export async function listSuperAdminOrgAdmins(organizationId: string): Promise<SuperAdminOrgAdminListResponse> {
  return apiClient.request<SuperAdminOrgAdminListResponse>(`/super-admin/organizations/${organizationId}/admins`);
}

export async function createSuperAdminOrgAdmin(
  organizationId: string,
  body: SuperAdminOrgAdminCreateRequest,
): Promise<SuperAdminOrgAdminResponse> {
  return apiClient.request<SuperAdminOrgAdminResponse>(`/super-admin/organizations/${organizationId}/admins`, {
    method: "POST",
    body,
  });
}

export async function patchSuperAdminAdmin(
  adminId: string,
  body: SuperAdminOrgAdminUpdateRequest,
): Promise<SuperAdminOrgAdminResponse> {
  return apiClient.request<SuperAdminOrgAdminResponse>(`/super-admin/admins/${adminId}`, {
    method: "PATCH",
    body,
  });
}

export async function resetSuperAdminAdminPassword(
  adminId: string,
  body: SuperAdminAdminResetPasswordRequest,
): Promise<SuperAdminAdminResetPasswordResponse> {
  return apiClient.request<SuperAdminAdminResetPasswordResponse>(`/super-admin/admins/${adminId}/reset-password`, {
    method: "POST",
    body,
  });
}

export async function disableSuperAdminAdmin(adminId: string): Promise<SuperAdminOrgAdminResponse> {
  return apiClient.request<SuperAdminOrgAdminResponse>(`/super-admin/admins/${adminId}/disable`, {
    method: "POST",
  });
}

export async function listSuperAdminOrgContracts(
  organizationId: string,
): Promise<SuperAdminContractListResponse> {
  return apiClient.request<SuperAdminContractListResponse>(`/super-admin/organizations/${organizationId}/contracts`);
}

export async function createSuperAdminContract(
  body: SuperAdminContractCreateRequest,
): Promise<SuperAdminContractResponse> {
  return apiClient.request<SuperAdminContractResponse>("/super-admin/contracts", {
    method: "POST",
    body,
  });
}

export async function patchSuperAdminContract(
  contractId: string,
  body: SuperAdminContractUpdateRequest,
): Promise<SuperAdminContractResponse> {
  return apiClient.request<SuperAdminContractResponse>(`/super-admin/contracts/${contractId}`, {
    method: "PATCH",
    body,
  });
}
