export type AdminRole = "super_admin" | "institution_admin";
export type AdminEffectiveRole = AdminRole | "super_admin_impersonating";

export type AdminImpersonationInfo = {
  organizationId: string | null;
  organizationName?: string | null;
  impersonatedByAdminId?: string | null;
  reason?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
};

export type AdminLoginRequest = {
  email: string;
  password: string;
};

export type AdminSummary = {
  id: string;
  organizationId: string | null;
  email: string;
  name: string;
  role: AdminRole;
  mustChangePassword?: boolean;
  effectiveRole?: AdminEffectiveRole | null;
  isImpersonating?: boolean;
  impersonatedByAdminId?: string | null;
  impersonationReason?: string | null;
  impersonationStartedAt?: string | null;
  impersonationExpiresAt?: string | null;
};

export type AdminLoginResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  admin: AdminSummary;
};
