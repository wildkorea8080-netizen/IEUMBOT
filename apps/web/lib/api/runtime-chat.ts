import { apiClient } from "./client";
import type {
  AdminTestChatMessageOptions,
  ChatRuntimeRequest,
  ChatRuntimeResponse,
} from "./runtime-chat-types";

export async function runRuntimeChat(body: ChatRuntimeRequest): Promise<ChatRuntimeResponse> {
  return apiClient.request<ChatRuntimeResponse>("/chat/messages", {
    method: "POST",
    body,
  });
}

export async function sendAdminTestChatMessage(
  chatbotId: string,
  message: string,
  options: AdminTestChatMessageOptions = {},
): Promise<ChatRuntimeResponse> {
  const trimmedChatbotId = chatbotId.trim();

  return apiClient.request<ChatRuntimeResponse>(
    `/admin/chatbots/${encodeURIComponent(trimmedChatbotId)}/test-chat`,
    {
      method: "POST",
      body: {
        chatbotId: trimmedChatbotId,
        question: message,
        ...(options.normalizedQuery !== undefined ? { normalizedQuery: options.normalizedQuery } : {}),
        ...(options.topK !== undefined ? { topK: options.topK } : {}),
      },
    },
  );
}

export async function runAdminTestChat(body: ChatRuntimeRequest): Promise<ChatRuntimeResponse> {
  return sendAdminTestChatMessage(body.chatbotId, body.question, {
    normalizedQuery: body.normalizedQuery,
    topK: body.topK,
  });
}
