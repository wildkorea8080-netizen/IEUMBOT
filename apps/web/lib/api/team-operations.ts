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

// ── 기관사용자 가입 승인 ──────────────────────────────────────────

export type PendingMember = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  requestedAt: string | null;
};

export async function getPendingMembers(): Promise<PendingMember[]> {
  const res = await apiClient.request<{ items: PendingMember[] }>("/admin/team/pending-members");
  return res.items ?? [];
}

export async function approvePendingMember(id: string): Promise<PendingMember> {
  return apiClient.request<PendingMember>(`/admin/team/pending-members/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectPendingMember(id: string): Promise<void> {
  await apiClient.request<void>(`/admin/team/pending-members/${id}/reject`, { method: "POST" });
}
