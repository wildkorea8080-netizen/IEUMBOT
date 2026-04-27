import { apiClient } from "./client";
import type {
  AdminChatbotUsageResponse,
  AdminUsageDailyResponse,
  AdminUsageSummary,
} from "./usage-types";

export async function getAdminUsageSummary(): Promise<AdminUsageSummary> {
  return apiClient.request<AdminUsageSummary>("/admin/usage/summary");
}

export async function getAdminUsageDaily(params?: {
  rangeType?: string;
  from?: string;
  to?: string;
}): Promise<AdminUsageDailyResponse> {
  const search = new URLSearchParams();
  if (params?.rangeType) search.set("rangeType", params.rangeType);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return apiClient.request<AdminUsageDailyResponse>(`/admin/usage/daily${query ? `?${query}` : ""}`);
}

export async function getAdminUsageChatbots(params?: {
  rangeType?: string;
  from?: string;
  to?: string;
}): Promise<AdminChatbotUsageResponse> {
  const search = new URLSearchParams();
  if (params?.rangeType) search.set("rangeType", params.rangeType);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return apiClient.request<AdminChatbotUsageResponse>(`/admin/usage/chatbots${query ? `?${query}` : ""}`);
}

