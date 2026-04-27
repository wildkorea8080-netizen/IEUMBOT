export type AdminUserRole = "user";
export type AdminUserStatus = "active" | "inactive";

export type AdminUserItem = {
  id: string;
  email: string;
  role: AdminUserRole;
  organizationId: string;
  status: AdminUserStatus;
  createdAt: string;
  updatedAt: string;
};

export type AdminUsersListResponse = {
  items: AdminUserItem[];
};

export type AdminUserCreateRequest = {
  email: string;
  password: string;
  role: AdminUserRole;
  status: AdminUserStatus;
};

export type AdminUserUpdateRequest = {
  email?: string;
  role?: AdminUserRole;
  status?: AdminUserStatus;
};
