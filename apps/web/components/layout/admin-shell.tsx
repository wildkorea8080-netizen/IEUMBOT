import type { ReactNode } from "react";

import { AdminHeader } from "./admin-header";
import { AdminSidebar } from "./admin-sidebar";
import { SystemStatusBanner } from "./system-status-banner";

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="flex min-h-screen bg-transparent">
      <AdminSidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AdminHeader />
        <SystemStatusBanner scope="admin" />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
