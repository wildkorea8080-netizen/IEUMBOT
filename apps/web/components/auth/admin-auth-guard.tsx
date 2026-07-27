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
import { firstPermittedHref, memberCanAccessHref } from "../../lib/admin-ui/menu-permissions";

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
  if (role === "institution_user") {
    return "/admin/no-access";
  }
  return "/admin/dashboard";
}

// 기관사용자는 권한 없는 페이지 접근 시 첫 허용 메뉴(없으면 권한없음 화면)로 보낸다.
function memberLandingPath(permissions: string[]): string {
  return firstPermittedHref(permissions) ?? "/admin/no-access";
}

function isPasswordChangePath(pathname: string): boolean {
  return pathname === "/admin/change-password";
}

// 권한 없음 화면은 기관사용자라면 언제나 접근 가능(막다른 곳 방지).
function isAlwaysAllowedMemberPath(pathname: string): boolean {
  return pathname === "/admin/no-access" || isPasswordChangePath(pathname);
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
          if (role === "institution_user") {
            router.replace(memberLandingPath(response.admin.menuPermissions ?? []));
          } else {
            router.replace(getDefaultPathByRole(role));
          }
          return;
        }
        if (
          role === "institution_admin" &&
          response.admin.mustChangePassword === true &&
          !isPasswordChangePath(pathname)
        ) {
          router.replace("/admin/change-password");
          return;
        }
        // 기관사용자: 부여된 메뉴만 접근 허용. 권한 없는 경로면 첫 허용 메뉴로.
        if (role === "institution_user" && !isAlwaysAllowedMemberPath(pathname)) {
          const perms = response.admin.menuPermissions ?? [];
          if (!memberCanAccessHref(pathname, perms)) {
            router.replace(memberLandingPath(perms));
            return;
          }
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
          // 동일계정 동시접속 제한으로 세션이 대체된 경우 별도 안내.
          const reason =
            error.code === "SESSION_SUPERSEDED" ? "concurrentLogin" : "sessionExpired";
          router.replace(`/login?next=${encodeURIComponent(pathname)}&reason=${reason}`);
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
