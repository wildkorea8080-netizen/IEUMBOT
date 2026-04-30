import { apiClient } from "./client";
import type {
  AdminSecurityEventDetail,
  AdminSecurityEventsResponse,
  AdminSecuritySummary,
} from "./security-types";

export async function getAdminSecuritySummary(): Promise<AdminSecuritySummary> {
  return apiClient.request<AdminSecuritySummary>("/admin/security/summary");
}

export async function getAdminSecurityEvents(params?: {
  from?: string;
  to?: string;
  eventType?: string;
  severity?: string;
  repeatedDissatisfactionOnly?: boolean;
  question?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminSecurityEventsResponse> {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.eventType) search.set("eventType", params.eventType);
  if (params?.severity) search.set("severity", params.severity);
  if (params?.repeatedDissatisfactionOnly) {
    search.set("repeatedDissatisfactionOnly", "true");
  }
  if (params?.question) search.set("question", params.question);
  if (typeof params?.page === "number") search.set("page", String(params.page));
  if (typeof params?.pageSize === "number") search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return apiClient.request<AdminSecurityEventsResponse>(`/admin/security/events${query ? `?${query}` : ""}`);
}

export async function getAdminSecurityEventDetail(eventId: string): Promise<AdminSecurityEventDetail> {
  return apiClient.request<AdminSecurityEventDetail>(`/admin/security/events/${eventId}`);
}
