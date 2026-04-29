import { clearAdminAccessToken, getAdminAccessToken } from "../auth/token";
import { getApiBaseUrl } from "./base-url";
import { apiClient } from "./client";
import type {
  AdminChatbotCreateRequest,
  AdminChatbotResponse,
  AdminChatbotsResponse,
  AdminChatLogsResponse,
  AdminDocumentsResponse,
  AdminWidgetResponse,
  DashboardQuestionTypeItem,
  DashboardRecentChatItem,
  DashboardSummaryResponse,
  DashboardUsageTrendItem,
  KnowledgeDetail,
  KnowledgeListResponse,
  KnowledgeTextCreateRequest,
  KnowledgeUpdateRequest,
  KnowledgeWebsiteCreateRequest,
} from "./admin-operations-types";

export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  return apiClient.request<DashboardSummaryResponse>("/admin/dashboard");
}

export async function getDashboardUsageTrend(params?: {
  from?: string;
  to?: string;
}): Promise<DashboardUsageTrendItem[]> {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return apiClient.request<DashboardUsageTrendItem[]>(`/admin/dashboard/usage-trend${query ? `?${query}` : ""}`);
}

export async function getDashboardQuestionTypes(params?: {
  from?: string;
  to?: string;
}): Promise<DashboardQuestionTypeItem[]> {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return apiClient.request<DashboardQuestionTypeItem[]>(`/admin/dashboard/question-types${query ? `?${query}` : ""}`);
}

export async function getDashboardRecentChats(params?: {
  limit?: number;
}): Promise<DashboardRecentChatItem[]> {
  const search = new URLSearchParams();
  if (typeof params?.limit === "number") search.set("limit", String(params.limit));
  const query = search.toString();
  return apiClient.request<DashboardRecentChatItem[]>(`/admin/dashboard/recent-chats${query ? `?${query}` : ""}`);
}

export async function getAdminDocuments(params?: {
  q?: string;
  status?: string;
}): Promise<AdminDocumentsResponse> {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  const query = search.toString();
  return apiClient.request<AdminDocumentsResponse>(`/admin/documents${query ? `?${query}` : ""}`);
}

export async function patchAdminDocument(documentId: string, body: {
  status: string;
}) {
  return apiClient.request(`/admin/documents/${documentId}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteAdminDocument(documentId: string): Promise<void> {
  return apiClient.request<void>(`/admin/documents/${documentId}`, { method: "DELETE" });
}

export async function getKnowledgeList(params?: {
  sourceGroup?: string;
  q?: string;
  category?: string;
  field?: string;
  status?: string;
}): Promise<KnowledgeListResponse> {
  const search = new URLSearchParams();
  if (params?.sourceGroup) search.set("sourceGroup", params.sourceGroup);
  if (params?.q) search.set("q", params.q);
  if (params?.category) search.set("category", params.category);
  if (params?.field) search.set("field", params.field);
  if (params?.status) search.set("status", params.status);
  const query = search.toString();
  return apiClient.request<KnowledgeListResponse>(`/admin/knowledge${query ? `?${query}` : ""}`);
}

export async function getKnowledgeDetail(knowledgeId: string): Promise<KnowledgeDetail> {
  return apiClient.request<KnowledgeDetail>(`/admin/knowledge/${knowledgeId}`);
}

export async function createKnowledgeText(body: KnowledgeTextCreateRequest): Promise<KnowledgeDetail> {
  return apiClient.request<KnowledgeDetail>("/admin/knowledge/text", {
    method: "POST",
    body,
  });
}

export async function createKnowledgeWebsite(body: KnowledgeWebsiteCreateRequest): Promise<KnowledgeDetail> {
  return apiClient.request<KnowledgeDetail>("/admin/knowledge/websites", {
    method: "POST",
    body,
  });
}

export async function patchKnowledge(knowledgeId: string, body: KnowledgeUpdateRequest): Promise<KnowledgeDetail> {
  return apiClient.request<KnowledgeDetail>(`/admin/knowledge/${knowledgeId}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteKnowledge(knowledgeId: string): Promise<void> {
  return apiClient.request<void>(`/admin/knowledge/${knowledgeId}`, { method: "DELETE" });
}

export async function reindexKnowledge(knowledgeId: string): Promise<KnowledgeDetail> {
  return apiClient.request<KnowledgeDetail>(`/admin/knowledge/${knowledgeId}/reindex`, {
    method: "POST",
  });
}

export async function uploadKnowledgeFile(body: {
  chatbotId: string;
  file: File;
  title: string;
  category?: string;
  field?: string;
  tags?: string[];
  memo?: string;
  effectiveDate?: string;
  department?: string;
}): Promise<KnowledgeDetail> {
  const token = getAdminAccessToken();
  const formData = new FormData();
  formData.set("chatbot_id", body.chatbotId);
  formData.set("title", body.title);
  formData.set("file", body.file);
  if (body.category) formData.set("category", body.category);
  if (body.field) formData.set("field", body.field);
  if (body.tags?.length) formData.set("tags", body.tags.join(","));
  if (body.memo) formData.set("memo", body.memo);
  if (body.effectiveDate) formData.set("effectiveDate", body.effectiveDate);
  if (body.department) formData.set("department", body.department);

  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/admin/knowledge/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAdminAccessToken();
    }
    let detail = `API request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await response.json()) as KnowledgeDetail;
}

export async function getAdminChatbots(): Promise<AdminChatbotsResponse> {
  return apiClient.request<AdminChatbotsResponse>("/admin/chatbots");
}

export async function createAdminChatbot(body: AdminChatbotCreateRequest): Promise<AdminChatbotResponse> {
  return apiClient.request<AdminChatbotResponse>("/admin/chatbots", {
    method: "POST",
    body,
  });
}

export async function getAdminChatbot(chatbotId: string): Promise<AdminChatbotResponse> {
  return apiClient.request<AdminChatbotResponse>(`/admin/chatbots/${chatbotId}`);
}

export async function patchAdminChatbot(chatbotId: string, body: Record<string, unknown>) {
  return apiClient.request(`/admin/chatbots/${chatbotId}`, {
    method: "PATCH",
    body,
  });
}

export async function getAdminChatLogs(params?: {
  chatbotId?: string;
  limit?: number;
}): Promise<AdminChatLogsResponse> {
  const search = new URLSearchParams();
  if (params?.chatbotId) search.set("chatbot_id", params.chatbotId);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiClient.request<AdminChatLogsResponse>(`/admin/logs/chat${query ? `?${query}` : ""}`);
}

export async function getAdminWidget(chatbotId: string): Promise<AdminWidgetResponse> {
  return apiClient.request<AdminWidgetResponse>(`/admin/chatbots/${chatbotId}/widget`);
}

export async function patchAdminWidget(chatbotId: string, body: {
  allowedDomains?: string[];
  isActive?: boolean;
  launcherLabel?: string;
}): Promise<AdminWidgetResponse> {
  return apiClient.request<AdminWidgetResponse>(`/admin/chatbots/${chatbotId}/widget`, {
    method: "PATCH",
    body,
  });
}
