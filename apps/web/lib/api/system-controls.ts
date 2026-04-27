import { apiClient } from "./client";
import type {
  PublicAnnouncementsResponse,
  PublicSystemStatusResponse,
  SuperAdminAnnouncementItem,
  SuperAdminAnnouncementListResponse,
  SuperAdminAnnouncementPatchRequest,
  SuperAdminAnnouncementUpsertRequest,
  SuperAdminMaintenanceItem,
  SuperAdminMaintenanceUpsertRequest,
} from "./system-controls-types";

export async function listPublicAnnouncements(organizationId?: string | null): Promise<PublicAnnouncementsResponse> {
  const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
  return apiClient.request<PublicAnnouncementsResponse>(`/public/announcements${query}`);
}

export async function getPublicSystemStatus(): Promise<PublicSystemStatusResponse> {
  return apiClient.request<PublicSystemStatusResponse>("/public/system-status");
}

export async function listSystemAnnouncements(): Promise<SuperAdminAnnouncementListResponse> {
  return apiClient.request<SuperAdminAnnouncementListResponse>("/super-admin/system/announcements");
}

export async function createSystemAnnouncement(
  body: SuperAdminAnnouncementUpsertRequest,
): Promise<SuperAdminAnnouncementItem> {
  return apiClient.request<SuperAdminAnnouncementItem>("/super-admin/system/announcements", {
    method: "POST",
    body,
  });
}

export async function patchSystemAnnouncement(
  announcementId: string,
  body: SuperAdminAnnouncementPatchRequest,
): Promise<SuperAdminAnnouncementItem> {
  return apiClient.request<SuperAdminAnnouncementItem>(`/super-admin/system/announcements/${announcementId}`, {
    method: "PATCH",
    body,
  });
}

export async function getSystemMaintenance(): Promise<SuperAdminMaintenanceItem> {
  return apiClient.request<SuperAdminMaintenanceItem>("/super-admin/system/maintenance");
}

export async function upsertSystemMaintenance(
  body: SuperAdminMaintenanceUpsertRequest,
): Promise<SuperAdminMaintenanceItem> {
  return apiClient.request<SuperAdminMaintenanceItem>("/super-admin/system/maintenance", {
    method: "POST",
    body,
  });
}

export async function disableSystemMaintenance(): Promise<SuperAdminMaintenanceItem> {
  return apiClient.request<SuperAdminMaintenanceItem>("/super-admin/system/maintenance/disable", {
    method: "POST",
  });
}
