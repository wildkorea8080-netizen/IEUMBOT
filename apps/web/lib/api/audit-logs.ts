import { apiClient } from "./client";
import type {
  AdminAuditLogDetail,
  AdminAuditLogsResponse,
} from "./audit-logs-types";

export async function getAdminAuditLogs(params?: {
  from?: string;
  to?: string;
  adminEmail?: string;
  actionType?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminAuditLogsResponse> {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.adminEmail) search.set("adminEmail", params.adminEmail);
  if (params?.actionType) search.set("actionType", params.actionType);
  if (typeof params?.page === "number") search.set("page", String(params.page));
  if (typeof params?.pageSize === "number") search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return apiClient.request<AdminAuditLogsResponse>(`/admin/audit-logs${query ? `?${query}` : ""}`);
}

export async function getAdminAuditLogDetail(logId: string): Promise<AdminAuditLogDetail> {
  return apiClient.request<AdminAuditLogDetail>(`/admin/audit-logs/${logId}`);
}

