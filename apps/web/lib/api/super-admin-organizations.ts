import { apiClient } from "./client";
import type {
  SuperAdminOrganizationCreateResponse,
  SuperAdminOrganizationDetail,
  SuperAdminOrganizationImpersonationRequest,
  SuperAdminOrganizationImpersonationResponse,
  SuperAdminOrganizationListParams,
  SuperAdminOrganizationListResponse,
  SuperAdminOrganizationUpsertRequest,
} from "./super-admin-organizations-types";

function buildListQuery(params: SuperAdminOrganizationListParams = {}): string {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.status && params.status !== "all") search.set("status", params.status);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return query ? `/super-admin/organizations?${query}` : "/super-admin/organizations";
}

export async function listSuperAdminOrganizations(
  params: SuperAdminOrganizationListParams = {},
): Promise<SuperAdminOrganizationListResponse> {
  return apiClient.request<SuperAdminOrganizationListResponse>(buildListQuery(params));
}

export async function getSuperAdminOrganization(organizationId: string): Promise<SuperAdminOrganizationDetail> {
  return apiClient.request<SuperAdminOrganizationDetail>(`/super-admin/organizations/${organizationId}`);
}

export async function createSuperAdminOrganization(
  body: SuperAdminOrganizationUpsertRequest,
): Promise<SuperAdminOrganizationCreateResponse> {
  return apiClient.request<SuperAdminOrganizationCreateResponse>("/super-admin/organizations", { method: "POST", body });
}

export async function patchSuperAdminOrganization(
  organizationId: string,
  body: Partial<SuperAdminOrganizationUpsertRequest>,
): Promise<SuperAdminOrganizationDetail> {
  return apiClient.request<SuperAdminOrganizationDetail>(`/super-admin/organizations/${organizationId}`, {
    method: "PATCH",
    body,
  });
}

export async function activateSuperAdminOrganization(
  organizationId: string,
): Promise<SuperAdminOrganizationDetail> {
  return apiClient.request<SuperAdminOrganizationDetail>(
    `/super-admin/organizations/${organizationId}/activate`,
    { method: "POST" },
  );
}

export async function suspendSuperAdminOrganization(
  organizationId: string,
): Promise<SuperAdminOrganizationDetail> {
  return apiClient.request<SuperAdminOrganizationDetail>(
    `/super-admin/organizations/${organizationId}/suspend`,
    { method: "POST" },
  );
}

export async function impersonateSuperAdminOrganization(
  organizationId: string,
  body: SuperAdminOrganizationImpersonationRequest,
): Promise<SuperAdminOrganizationImpersonationResponse> {
  return apiClient.request<SuperAdminOrganizationImpersonationResponse>(
    `/super-admin/organizations/${organizationId}/impersonate`,
    {
      method: "POST",
      body,
    },
  );
}
