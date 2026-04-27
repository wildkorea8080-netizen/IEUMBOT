import type { ReactNode } from "react";

import { AdminAuthGuard } from "../../components/auth/admin-auth-guard";
import { SuperAdminShell } from "../../components/layout/super-admin-shell";

type SuperAdminLayoutProps = {
  children: ReactNode;
};

export default function SuperAdminLayout({ children }: SuperAdminLayoutProps) {
  return (
    <AdminAuthGuard allowedRoles={["super_admin"]}>
      <SuperAdminShell>{children}</SuperAdminShell>
    </AdminAuthGuard>
  );
}
