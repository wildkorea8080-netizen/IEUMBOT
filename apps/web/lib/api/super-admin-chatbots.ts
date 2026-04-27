import { apiClient } from "./client";
import type {
  SuperAdminChatbotDetailResponse,
  SuperAdminChatbotListResponse,
} from "./super-admin-chatbots-types";

export async function listSuperAdminChatbots(
  organizationId: string,
): Promise<SuperAdminChatbotListResponse> {
  return apiClient.request<SuperAdminChatbotListResponse>(`/super-admin/organizations/${organizationId}/chatbots`);
}

export async function getSuperAdminChatbot(chatbotId: string): Promise<SuperAdminChatbotDetailResponse> {
  return apiClient.request<SuperAdminChatbotDetailResponse>(`/super-admin/chatbots/${chatbotId}`);
}

export async function activateSuperAdminChatbot(
  chatbotId: string,
): Promise<SuperAdminChatbotDetailResponse> {
  return apiClient.request<SuperAdminChatbotDetailResponse>(`/super-admin/chatbots/${chatbotId}/activate`, {
    method: "POST",
  });
}

export async function suspendSuperAdminChatbot(
  chatbotId: string,
): Promise<SuperAdminChatbotDetailResponse> {
  return apiClient.request<SuperAdminChatbotDetailResponse>(`/super-admin/chatbots/${chatbotId}/suspend`, {
    method: "POST",
  });
}
