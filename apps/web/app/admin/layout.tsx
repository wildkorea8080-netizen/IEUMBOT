import type { ReactNode } from "react";

import { AdminAuthGuard } from "../../components/auth/admin-auth-guard";
import { AdminShell } from "../../components/layout/admin-shell";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminAuthGuard allowedRoles={["institution_admin"]}>
      <AdminShell>{children}</AdminShell>
    </AdminAuthGuard>
  );
}
