import { apiClient } from "./client";
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationReadRequest,
  SystemIntegrationItem,
  SystemIntegrationListResponse,
  SystemIntegrationUpsertRequest,
} from "./notifications-types";

function buildQuery(params?: { severity?: string; type?: string }): string {
  const search = new URLSearchParams();
  if (params?.severity) search.set("severity", params.severity);
  if (params?.type) search.set("type", params.type);
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function getSuperAdminNotifications(params?: {
  severity?: string;
  type?: string;
}): Promise<NotificationListResponse> {
  return apiClient.request<NotificationListResponse>(`/super-admin/notifications${buildQuery(params)}`);
}

export async function markSuperAdminNotificationRead(
  notificationId: string,
  body: NotificationReadRequest,
): Promise<NotificationItem> {
  return apiClient.request<NotificationItem>(`/super-admin/notifications/${notificationId}/read`, {
    method: "PATCH",
    body,
  });
}

export async function getAdminNotifications(params?: {
  severity?: string;
  type?: string;
}): Promise<NotificationListResponse> {
  return apiClient.request<NotificationListResponse>(`/admin/notifications${buildQuery(params)}`);
}

export async function getSystemIntegrations(): Promise<SystemIntegrationListResponse> {
  return apiClient.request<SystemIntegrationListResponse>("/super-admin/system-integrations");
}

export async function createSystemIntegration(
  body: SystemIntegrationUpsertRequest,
): Promise<SystemIntegrationItem> {
  return apiClient.request<SystemIntegrationItem>("/super-admin/system-integrations", {
    method: "POST",
    body,
  });
}

export async function patchSystemIntegration(
  integrationId: string,
  body: SystemIntegrationUpsertRequest,
): Promise<SystemIntegrationItem> {
  return apiClient.request<SystemIntegrationItem>(`/super-admin/system-integrations/${integrationId}`, {
    method: "PATCH",
    body,
  });
}
