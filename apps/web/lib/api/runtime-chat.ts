import { apiClient } from "./client";
import type { ChatRuntimeRequest, ChatRuntimeResponse } from "./runtime-chat-types";

export async function runRuntimeChat(body: ChatRuntimeRequest): Promise<ChatRuntimeResponse> {
  return apiClient.request<ChatRuntimeResponse>("/chat/messages", {
    method: "POST",
    body,
  });
}
