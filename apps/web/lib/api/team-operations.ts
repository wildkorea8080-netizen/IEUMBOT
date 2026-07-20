import { apiClient } from "./index";

export type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  authProvider: string;
  lastLoginAt: string | null;
  createdAt: string | null;
};

export type TeamMemberCreateResult = {
  id: string;
  email: string;
  name: string;
  temporaryPassword: string;
};

export async function getTeamMembers(): Promise<TeamMember[]> {
  const res = await apiClient.request<{ items: TeamMember[] }>("/admin/team/members");
  return res.items ?? [];
}

export async function createTeamMember(input: {
  email: string;
  name: string;
}): Promise<TeamMemberCreateResult> {
  return apiClient.request<TeamMemberCreateResult>("/admin/team/members", {
    method: "POST",
    body: input,
  });
}

export async function updateTeamMember(
  id: string,
  body: { name?: string; status?: string },
): Promise<TeamMember> {
  return apiClient.request<TeamMember>(`/admin/team/members/${id}`, {
    method: "PATCH",
    body,
  });
}

export async function resetTeamMemberPassword(
  id: string,
): Promise<{ id: string; temporaryPassword: string }> {
  return apiClient.request<{ id: string; temporaryPassword: string }>(
    `/admin/team/members/${id}/reset-password`,
    { method: "POST" },
  );
}
