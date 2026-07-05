import { apiClient } from "./client";
import type {
  AdminConversationDetail,
  AdminConversationsListResponse,
  AdminConversationUpdateRequest,
  AdminSubjectDistribution,
} from "./conversations-types";

export async function getSubjectDistribution(params?: {
  chatbotId?: string;
  from?: string;
  to?: string;
}): Promise<AdminSubjectDistribution> {
  const search = new URLSearchParams();
  if (params?.chatbotId) search.set("chatbotId", params.chatbotId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return apiClient.request<AdminSubjectDistribution>(
    `/admin/conversations/subject-distribution${query ? `?${query}` : ""}`,
  );
}

export async function getAdminConversations(params?: {
  from?: string;
  to?: string;
  question?: string;
  answerStatus?: string;
  escalated?: boolean;
  hasCitations?: boolean;
  llmExecuted?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<AdminConversationsListResponse> {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.question) search.set("question", params.question);
  if (params?.answerStatus) search.set("answerStatus", params.answerStatus);
  if (typeof params?.escalated === "boolean") search.set("escalated", String(params.escalated));
  if (typeof params?.hasCitations === "boolean") search.set("hasCitations", String(params.hasCitations));
  if (typeof params?.llmExecuted === "boolean") search.set("llmExecuted", String(params.llmExecuted));
  if (typeof params?.page === "number") search.set("page", String(params.page));
  if (typeof params?.pageSize === "number") search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return apiClient.request<AdminConversationsListResponse>(`/admin/conversations${query ? `?${query}` : ""}`);
}

export async function getAdminConversationDetail(sessionId: string): Promise<AdminConversationDetail> {
  return apiClient.request<AdminConversationDetail>(`/admin/conversations/${sessionId}`);
}

export async function patchAdminConversation(
  sessionId: string,
  body: AdminConversationUpdateRequest,
): Promise<AdminConversationDetail> {
  return apiClient.request<AdminConversationDetail>(`/admin/conversations/${sessionId}`, {
    method: "PATCH",
    body,
  });
}
