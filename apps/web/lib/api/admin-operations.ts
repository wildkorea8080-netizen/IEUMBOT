import { clearAdminAccessToken, getAdminAccessToken } from "../auth/token";
import { getApiBaseUrl } from "./base-url";
import { apiClient } from "./client";
import type {
  AdminChatbotCreateRequest,
  AdminChatbotResponse,
  AdminChatbotsResponse,
  AdminChatLogsResponse,
  AdminDocumentsResponse,
  AdminKnowledgeGapResponse,
  AdminQualityReportResponse,
  AdminRoiDashboardResponse,
  AdminWidgetIconAsset,
  AdminWidgetResponse,
  DashboardQuestionTypeItem,
  DashboardRecentChatItem,
  DashboardSummaryResponse,
  DashboardUsageTrendItem,
  FaqAnalyzeResponse,
  FaqBulkCreateItem,
  FaqBulkCreateResponse,
  FaqManagementItem,
  FaqManagementListResponse,
  FaqManagementCreateRequest,
  FaqManagementUpdateRequest,
  KnowledgeDetail,
  KnowledgeItem,
  KnowledgeListResponse,
  KnowledgeRuntimeStatus,
  KnowledgeTextCreateRequest,
  KnowledgeUpdateRequest,
  KnowledgeWebsiteCreateRequest,
  WebSourceSyncSettings,
} from "./admin-operations-types";

function formatUnknownApiDetail(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const messages = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const detail = "msg" in item && typeof item.msg === "string" ? item.msg : undefined;
          const location = Array.isArray((item as { loc?: unknown }).loc)
            ? ((item as { loc?: unknown[] }).loc ?? []).join(".")
            : undefined;
          if (location && detail) return `${location}: ${detail}`;
          if (detail) return detail;
        }
        return undefined;
      })
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join(", ") : undefined;
  }
  if (value && typeof value === "object") {
    if ("message" in value && typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return undefined;
}

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

export async function getAdminQualityReport(params?: {
  chatbotId?: string;
  startDate?: string;
  endDate?: string;
  fallbackOnly?: boolean;
}): Promise<AdminQualityReportResponse> {
  const search = new URLSearchParams();
  if (params?.chatbotId) search.set("chatbotId", params.chatbotId);
  if (params?.startDate) search.set("startDate", params.startDate);
  if (params?.endDate) search.set("endDate", params.endDate);
  if (typeof params?.fallbackOnly === "boolean") search.set("fallbackOnly", String(params.fallbackOnly));
  const query = search.toString();
  return apiClient.request<AdminQualityReportResponse>(`/admin/quality-report${query ? `?${query}` : ""}`);
}

export async function getAdminKnowledgeGap(params?: {
  chatbotId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AdminKnowledgeGapResponse> {
  const search = new URLSearchParams();
  if (params?.chatbotId) search.set("chatbotId", params.chatbotId);
  if (params?.startDate) search.set("startDate", params.startDate);
  if (params?.endDate) search.set("endDate", params.endDate);
  const query = search.toString();
  return apiClient.request<AdminKnowledgeGapResponse>(`/admin/knowledge-gap${query ? `?${query}` : ""}`);
}

export async function getAdminRoiDashboard(params?: {
  chatbotId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AdminRoiDashboardResponse> {
  const search = new URLSearchParams();
  if (params?.chatbotId) search.set("chatbotId", params.chatbotId);
  if (params?.startDate) search.set("startDate", params.startDate);
  if (params?.endDate) search.set("endDate", params.endDate);
  const query = search.toString();
  return apiClient.request<AdminRoiDashboardResponse>(`/admin/roi-dashboard${query ? `?${query}` : ""}`);
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

export async function getKnowledgeRuntimeStatus(): Promise<KnowledgeRuntimeStatus> {
  return apiClient.request<KnowledgeRuntimeStatus>("/admin/knowledge/runtime-status");
}

export async function getKnowledgeDiagnostics(): Promise<KnowledgeItem[]> {
  return apiClient.request<KnowledgeItem[]>("/admin/knowledge/diagnostics");
}

export async function getKnowledgeDetail(knowledgeId: string): Promise<KnowledgeDetail> {
  return apiClient.request<KnowledgeDetail>(`/admin/knowledge/${knowledgeId}`);
}

export type KnowledgeContent = {
  content: string;
  chunkCount: number;
  sourceType: string;
  title: string;
};

export async function getKnowledgeContent(knowledgeId: string): Promise<KnowledgeContent> {
  return apiClient.request<KnowledgeContent>(`/admin/knowledge/${knowledgeId}/content`);
}

export async function updateKnowledgeContent(
  knowledgeId: string,
  content: string,
): Promise<{ success: boolean; versionNumber: number }> {
  return apiClient.request(`/admin/knowledge/${knowledgeId}/content`, {
    method: "PUT",
    body: { content },
  });
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

export async function reindexAllKnowledge(chatbotId: string): Promise<{ queued: number; skipped: number }> {
  return apiClient.request<{ queued: number; skipped: number }>(
    `/admin/knowledge/reindex-all?chatbotId=${encodeURIComponent(chatbotId)}`,
    { method: "POST" },
  );
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
  use_vision?: boolean;
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
  formData.set("use_vision", body.use_vision ? "true" : "false");

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
      const payload = (await response.json()) as { detail?: unknown };
      const parsed = formatUnknownApiDetail(payload.detail);
      if (parsed) detail = parsed;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await response.json()) as KnowledgeDetail;
}

export type StagingSessionResponse = {
  sessionId: string;
  chatbotId: string;
  sourceType: string;
  sourceName: string | null;
  status: string;
  totalChunks: number;
  isDuplicateFile?: boolean;
  chunks: Array<{
    id: string;
    topicTitle: string;
    content: string;
    tags: string[];
    piiDetected: boolean;
    piiRegions: Array<{ start: number; end: number; type: string; preview: string }>;
    mergeCandidateTitle: string | null;
    mergeCandidateId: string | null;
    mergeScore: number | null;
    registrationType: "new" | "merge";
    status: "pending" | "registered" | "skipped";
    sortOrder: number;
  }>;
};

export async function uploadKnowledgeFileToStaging(body: {
  chatbotId: string;
  file: File;
}): Promise<StagingSessionResponse> {
  const token = getAdminAccessToken();
  const formData = new FormData();
  formData.set("chatbot_id", body.chatbotId);
  formData.set("file", body.file);

  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/admin/knowledge/staging/file`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) clearAdminAccessToken();
    let detail = `STAGING_FAILED:${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      const parsed = formatUnknownApiDetail(payload.detail);
      if (parsed) detail = parsed;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  return (await response.json()) as StagingSessionResponse;
}

export async function createKnowledgeTextToStaging(body: {
  chatbotId: string;
  title: string;
  content: string;
}): Promise<StagingSessionResponse> {
  return apiClient.request<StagingSessionResponse>("/admin/knowledge/staging/text", {
    method: "POST",
    body: { chatbotId: body.chatbotId, title: body.title, content: body.content },
  });
}

export async function analyzeFaqFromKnowledge(
  knowledgeId: string,
  params: { chatbotId: string; maxTopics?: number; faqsPerTopic?: number },
): Promise<FaqAnalyzeResponse> {
  return apiClient.request<FaqAnalyzeResponse>(
    `/admin/knowledge/${knowledgeId}/analyze-faq`,
    {
      method: "POST",
      body: {
        chatbot_id: params.chatbotId,
        max_topics: params.maxTopics ?? 6,
        faqs_per_topic: params.faqsPerTopic ?? 2,
      },
    },
  );
}

export async function bulkCreateFaq(
  chatbotId: string,
  faqs: FaqBulkCreateItem[],
): Promise<FaqBulkCreateResponse> {
  return apiClient.request<FaqBulkCreateResponse>("/admin/faq/bulk-create", {
    method: "POST",
    body: { chatbot_id: chatbotId, faqs },
  });
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

export function getAdminChatLogsExportUrl(params?: {
  chatbotId?: string;
  limit?: number;
}): string {
  const search = new URLSearchParams();
  if (params?.chatbotId) search.set("chatbot_id", params.chatbotId);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return `/api/admin/logs/chat/export-csv${query ? `?${query}` : ""}`;
}

export async function createAdminWidget(chatbotId: string): Promise<AdminWidgetResponse> {
  return apiClient.request<AdminWidgetResponse>(`/admin/chatbots/${chatbotId}/widget`, { method: "POST" });
}

export async function getAdminWidget(chatbotId: string): Promise<AdminWidgetResponse> {
  return apiClient.request<AdminWidgetResponse>(`/admin/chatbots/${chatbotId}/widget`);
}

export async function patchAdminWidget(chatbotId: string, body: {
  allowedDomains?: string[];
  isActive?: boolean;
  themeColor?: string;
  launcherLabel?: string;
  welcomeMessage?: string;
  chatbotDisplayName?: string;
  institutionName?: string;
  logoUrl?: string;
  introMessage?: string;
  colorPreset?: string;
  launcherIcon?: string;
  launcherIconUrl?: string;
  launcherHoverMessage?: string;
  bannerTitle?: string;
  bannerDescription?: string;
  starterQuestions?: string[];
}): Promise<AdminWidgetResponse> {
  return apiClient.request<AdminWidgetResponse>(`/admin/chatbots/${chatbotId}/widget`, {
    method: "PATCH",
    body,
  });
}

export async function listAdminWidgetIcons(): Promise<AdminWidgetIconAsset[]> {
  const token = getAdminAccessToken();
  const response = await fetch("/api/admin/widget-icons", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401) clearAdminAccessToken();
    throw new Error(`아이콘 목록을 불러오지 못했습니다. (${response.status})`);
  }

  const payload = (await response.json()) as { items?: AdminWidgetIconAsset[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function uploadAdminWidgetIcon(file: File): Promise<AdminWidgetIconAsset> {
  const token = getAdminAccessToken();
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/admin/widget-icons", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) clearAdminAccessToken();
    throw new Error(`아이콘 업로드에 실패했습니다. (${response.status})`);
  }

  return (await response.json()) as AdminWidgetIconAsset;
}

export async function deleteAdminWidgetIcon(url: string): Promise<void> {
  const token = getAdminAccessToken();
  const response = await fetch("/api/admin/widget-icons", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url }),
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) clearAdminAccessToken();
    throw new Error(`아이콘 삭제에 실패했습니다. (${response.status})`);
  }
}

// ── 피드백 통계 ──────────────────────────────────────────

export interface FeedbackSummary {
  totalAssistantMessages: number;
  feedbackReceived: number;
  thumbsUp: number;
  thumbsDown: number;
  positiveRate: number;
}

export interface LowRatedMessageItem {
  messageId: string;
  normalizedQuery: string;
  content: string;
  feedbackAt: string | null;
  createdAt: string | null;
}

export interface DocumentFeedbackItem {
  documentName: string;
  documentId: string | null;
  thumbsUp: number;
  thumbsDown: number;
  totalFeedback: number;
  positiveRate: number;
}

export async function getFeedbackSummary(chatbotId?: string): Promise<FeedbackSummary> {
  const q = chatbotId ? `?chatbotId=${encodeURIComponent(chatbotId)}` : "";
  return apiClient.request<FeedbackSummary>(`/admin/feedback/summary${q}`);
}

export async function getLowRatedMessages(params: {
  chatbotId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: LowRatedMessageItem[] }> {
  const q = new URLSearchParams();
  if (params.chatbotId) q.set("chatbotId", params.chatbotId);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString() ? `?${q.toString()}` : "";
  return apiClient.request<{ total: number; items: LowRatedMessageItem[] }>(
    `/admin/feedback/low-rated${qs}`,
  );
}

export async function getFeedbackByDocument(
  chatbotId?: string,
): Promise<{ items: DocumentFeedbackItem[] }> {
  const q = chatbotId ? `?chatbotId=${encodeURIComponent(chatbotId)}` : "";
  return apiClient.request<{ items: DocumentFeedbackItem[] }>(
    `/admin/feedback/by-document${q}`,
  );
}

// ── 미답변 질문 ──────────────────────────────────────────────────────────────

export type UnansweredLogItem = {
  id: string;
  chatbotId: string;
  question: string;
  searchScore: number | null;
  outcome: string;
  sessionId: string | null;
  status: "pending" | "resolved" | "ignored";
  resolvedAt: string | null;
  createdAt: string;
};

export type UnansweredLogListResponse = {
  items: UnansweredLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getUnansweredLogs(params?: {
  chatbotId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<UnansweredLogListResponse> {
  const q = new URLSearchParams();
  if (params?.chatbotId) q.set("chatbotId", params.chatbotId);
  if (params?.status) q.set("status", params.status);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.page) q.set("page", String(params.page));
  if (params?.pageSize) q.set("pageSize", String(params.pageSize));
  const qs = q.toString() ? `?${q.toString()}` : "";
  return apiClient.request<UnansweredLogListResponse>(`/admin/unanswered${qs}`);
}

export async function patchUnansweredLog(
  id: string,
  status: "pending" | "resolved" | "ignored",
): Promise<UnansweredLogItem> {
  return apiClient.request<UnansweredLogItem>(`/admin/unanswered/${id}`, {
    method: "PATCH",
    body: { status },
  });
}

// ── FAQ 관리 ─────────────────────────────────────────────────────────────────

export async function listFaqItems(
  chatbotId: string,
  includeInactive = false,
): Promise<FaqManagementListResponse> {
  const params = new URLSearchParams({ chatbot_id: chatbotId });
  if (includeInactive) params.set("include_inactive", "true");
  return apiClient.request<FaqManagementListResponse>(`/admin/faq?${params}`);
}

export async function createFaqItem(body: FaqManagementCreateRequest): Promise<FaqManagementItem> {
  return apiClient.request<FaqManagementItem>("/admin/faq", { method: "POST", body });
}

export async function updateFaqItem(
  faqId: string,
  body: FaqManagementUpdateRequest,
): Promise<FaqManagementItem> {
  return apiClient.request<FaqManagementItem>(`/admin/faq/${faqId}`, { method: "PATCH", body });
}

export async function deleteFaqItem(faqId: string): Promise<void> {
  await apiClient.request(`/admin/faq/${faqId}`, { method: "DELETE" });
}

// ── 웹소스 자동 업데이트 ─────────────────────────────────────────────────────

export async function triggerWebSourceSync(webSourceId: string): Promise<void> {
  await apiClient.request(`/admin/knowledge/web-sources/${webSourceId}/sync`, { method: "POST" });
}

export async function getWebSourceSyncSettings(webSourceId: string): Promise<WebSourceSyncSettings> {
  return apiClient.request<WebSourceSyncSettings>(
    `/admin/knowledge/web-sources/${webSourceId}/sync-settings`,
  );
}

export async function updateWebSourceSyncSettings(
  webSourceId: string,
  body: { syncEnabled: boolean; syncIntervalDays?: number | null },
): Promise<WebSourceSyncSettings> {
  return apiClient.request<WebSourceSyncSettings>(
    `/admin/knowledge/web-sources/${webSourceId}/sync-settings`,
    { method: "PATCH", body },
  );
}
