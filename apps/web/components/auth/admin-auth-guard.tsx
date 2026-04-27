"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ApiClientError, apiClient } from "../../lib/api";
import {
  clearAdminAccessToken,
  endAdminImpersonation,
  getAdminAccessToken,
  readAdminImpersonation,
} from "../../lib/auth/token";
import type { AdminRole, AdminSummary } from "../../lib/auth/types";

type AdminAuthGuardProps = {
  children: ReactNode;
  allowedRoles?: AdminRole[];
};

type AdminMeResponse = {
  admin: AdminSummary;
};

function getDefaultPathByRole(role: AdminRole): string {
  if (role === "super_admin") {
    return "/super-admin/dashboard";
  }
  return "/admin/dashboard";
}

export function AdminAuthGuard({ children, allowedRoles }: AdminAuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function validateSession() {
      const token = getAdminAccessToken();
      if (!token) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      try {
        const response = await apiClient.request<AdminMeResponse>("/admin/auth/me");
        const role = response.admin.role;
        if (allowedRoles && !allowedRoles.includes(role)) {
          router.replace(getDefaultPathByRole(role));
          return;
        }
        if (isMounted) {
          setIsReady(true);
        }
      } catch (error) {
        if (readAdminImpersonation() && error instanceof ApiClientError && error.status === 401) {
          endAdminImpersonation();
          router.replace("/super-admin/dashboard");
          return;
        }
        clearAdminAccessToken();
        if (error instanceof ApiClientError && error.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}&reason=sessionExpired`);
          return;
        }
        router.replace(`/login?next=${encodeURIComponent(pathname)}&reason=authFailed`);
      }
    }

    void validateSession();

    return () => {
      isMounted = false;
    };
  }, [allowedRoles, pathname, router]);

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
            <p className="pt-2 text-sm text-slate-600">접속 상태를 확인하는 중입니다.</p>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
