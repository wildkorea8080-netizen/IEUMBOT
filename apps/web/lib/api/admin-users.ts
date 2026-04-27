import { apiClient } from "./client";
import type {
  AdminUserCreateRequest,
  AdminUserItem,
  AdminUsersListResponse,
  AdminUserUpdateRequest,
} from "./admin-users-types";

export async function listAdminUsers(): Promise<AdminUsersListResponse> {
  return apiClient.request<AdminUsersListResponse>("/admin/users");
}

export async function createAdminUser(body: AdminUserCreateRequest): Promise<AdminUserItem> {
  return apiClient.request<AdminUserItem>("/admin/users", {
    method: "POST",
    body,
  });
}

export async function patchAdminUser(userId: string, body: AdminUserUpdateRequest): Promise<AdminUserItem> {
  return apiClient.request<AdminUserItem>(`/admin/users/${userId}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteAdminUser(userId: string): Promise<void> {
  return apiClient.request<void>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}
