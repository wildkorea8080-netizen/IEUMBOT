import { apiClient } from "./client";
import type {
  AnswerSettingsResponse,
  AnswerSettingsUpsertRequest,
} from "./answer-settings-types";

export async function getAnswerSettings(chatbotId: string): Promise<AnswerSettingsResponse> {
  return apiClient.request<AnswerSettingsResponse>(`/admin/chatbots/${chatbotId}/answer-settings`);
}

export async function putAnswerSettings(
  chatbotId: string,
  body: AnswerSettingsUpsertRequest,
): Promise<AnswerSettingsResponse> {
  return apiClient.request<AnswerSettingsResponse>(
    `/admin/chatbots/${chatbotId}/answer-settings`,
    {
      method: "PUT",
      body,
    },
  );
}

export async function patchAnswerSettings(
  chatbotId: string,
  body: AnswerSettingsUpsertRequest,
): Promise<AnswerSettingsResponse> {
  return apiClient.request<AnswerSettingsResponse>(
    `/admin/chatbots/${chatbotId}/answer-settings`,
    {
      method: "PATCH",
      body,
    },
  );
}
