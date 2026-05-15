import { apiClient } from "./client";

export type AdminChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type AdminChangePasswordResponse = {
  success: boolean;
};

export async function changeAdminPassword(
  body: AdminChangePasswordRequest,
): Promise<AdminChangePasswordResponse> {
  return apiClient.request<AdminChangePasswordResponse>("/admin/auth/change-password", {
    method: "POST",
    body,
  });
}
