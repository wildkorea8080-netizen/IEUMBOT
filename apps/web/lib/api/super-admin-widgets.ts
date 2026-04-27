import { apiClient } from "./client";
import type {
  SuperAdminWidgetCreateRequest,
  SuperAdminWidgetCreateResponse,
  SuperAdminWidgetDetailResponse,
  SuperAdminWidgetDomainsPatchRequest,
  SuperAdminWidgetListResponse,
} from "./super-admin-widgets-types";

export async function listSuperAdminWidgets(): Promise<SuperAdminWidgetListResponse> {
  return apiClient.request<SuperAdminWidgetListResponse>("/super-admin/widgets");
}

export async function listSuperAdminWidgetsByOrganization(
  organizationId: string,
): Promise<SuperAdminWidgetListResponse> {
  return apiClient.request<SuperAdminWidgetListResponse>(`/super-admin/organizations/${organizationId}/widgets`);
}

export async function createSuperAdminWidget(
  body: SuperAdminWidgetCreateRequest,
): Promise<SuperAdminWidgetCreateResponse> {
  return apiClient.request<SuperAdminWidgetCreateResponse>("/super-admin/widgets", {
    method: "POST",
    body,
  });
}

export async function patchSuperAdminWidgetDomains(
  widgetId: string,
  body: SuperAdminWidgetDomainsPatchRequest,
): Promise<SuperAdminWidgetDetailResponse> {
  return apiClient.request<SuperAdminWidgetDetailResponse>(`/super-admin/widgets/${widgetId}/domains`, {
    method: "PATCH",
    body,
  });
}

export async function activateSuperAdminWidget(
  widgetId: string,
): Promise<SuperAdminWidgetDetailResponse> {
  return apiClient.request<SuperAdminWidgetDetailResponse>(`/super-admin/widgets/${widgetId}/activate`, {
    method: "POST",
  });
}

export async function deactivateSuperAdminWidget(
  widgetId: string,
): Promise<SuperAdminWidgetDetailResponse> {
  return apiClient.request<SuperAdminWidgetDetailResponse>(`/super-admin/widgets/${widgetId}/deactivate`, {
    method: "POST",
  });
}
