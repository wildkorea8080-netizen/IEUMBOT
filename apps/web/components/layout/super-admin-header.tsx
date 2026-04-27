"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { apiClient } from "../../lib/api";
import { clearAdminAccessToken } from "../../lib/auth/token";
import { getSuperAdminRouteMeta } from "./super-admin-route-meta";

export function SuperAdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const routeMeta = getSuperAdminRouteMeta(pathname);

  const handleLogout = async () => {
    try {
      await apiClient.request<void>("/admin/auth/logout", { method: "POST" });
    } catch {
      // Ignore endpoint failures and continue local logout.
    } finally {
      clearAdminAccessToken();
      router.replace("/login");
    }
  };

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {routeMeta.breadcrumbs.map((item, index) => (
              <span key={`${item}-${index}`} className="flex items-center gap-2">
                {index > 0 ? <span className="text-slate-300">/</span> : null}
                <span>{item}</span>
              </span>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-base font-semibold text-slate-900">{routeMeta.title}</h1>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              역할: 전체 관리자
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/super-admin/dashboard" className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 lg:hidden">
            IEUMBOT
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
