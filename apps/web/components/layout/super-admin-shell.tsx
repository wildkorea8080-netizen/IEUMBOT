import type { ReactNode } from "react";

import { SuperAdminHeader } from "./super-admin-header";
import { SuperAdminSidebar } from "./super-admin-sidebar";
import { SystemStatusBanner } from "./system-status-banner";

type SuperAdminShellProps = {
  children: ReactNode;
};

export function SuperAdminShell({ children }: SuperAdminShellProps) {
  return (
    <div className="flex min-h-screen bg-transparent">
      <SuperAdminSidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <SuperAdminHeader />
        <SystemStatusBanner scope="super_admin" />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
