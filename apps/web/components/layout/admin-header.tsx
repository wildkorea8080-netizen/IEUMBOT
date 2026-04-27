"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { apiClient } from "../../lib/api";
import {
  ADMIN_IMPERSONATION_EVENT,
  clearAdminAccessToken,
  endAdminImpersonation,
  readAdminImpersonation,
  type AdminImpersonationState,
} from "../../lib/auth/token";
import {
  ADMIN_SELECTED_CHATBOT_EVENT,
  readSelectedAdminChatbot,
  type SelectedAdminChatbot,
} from "../../lib/admin-ui/selected-chatbot";
import { getAdminRouteMeta } from "./admin-route-meta";

export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const routeMeta = getAdminRouteMeta(pathname);
  const [selectedChatbot, setSelectedChatbot] = useState<SelectedAdminChatbot | null>(null);
  const [impersonation, setImpersonation] = useState<AdminImpersonationState | null>(null);
  const [isEndingImpersonation, setIsEndingImpersonation] = useState(false);
  const [impersonationError, setImpersonationError] = useState<string | null>(null);

  useEffect(() => {
    function syncState() {
      setSelectedChatbot(readSelectedAdminChatbot());
      setImpersonation(readAdminImpersonation());
    }

    syncState();
    window.addEventListener("storage", syncState);
    window.addEventListener(ADMIN_SELECTED_CHATBOT_EVENT, syncState as EventListener);
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, syncState as EventListener);
    return () => {
      window.removeEventListener("storage", syncState);
      window.removeEventListener(ADMIN_SELECTED_CHATBOT_EVENT, syncState as EventListener);
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, syncState as EventListener);
    };
  }, []);

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

  const handleEndImpersonation = async () => {
    if (!impersonation) return;
    setIsEndingImpersonation(true);
    setImpersonationError(null);
    try {
      const response = await apiClient.request<{ redirectUrl: string }>("/admin/impersonation/end", {
        method: "POST",
      });
      endAdminImpersonation();
      router.replace(response.redirectUrl || "/super-admin/dashboard");
    } catch (error) {
      setImpersonationError(error instanceof Error ? error.message : "대리 접속 종료에 실패했습니다.");
    } finally {
      setIsEndingImpersonation(false);
    }
  };

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      {impersonation ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900">
                지원 세션: {impersonation.organizationName}
              </p>
              <p className="text-xs text-amber-700">
                사유: {impersonation.reason} | 만료:{" "}
                {new Date(impersonation.expiresAt).toLocaleString("ko-KR")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleEndImpersonation}
              disabled={isEndingImpersonation}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 disabled:opacity-60"
            >
              {isEndingImpersonation ? "종료 중..." : "종료"}
            </button>
          </div>
          {impersonationError ? <p className="mt-2 text-xs text-rose-700">{impersonationError}</p> : null}
        </div>
      ) : null}

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
            {selectedChatbot ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                현재 챗봇: <strong className="text-slate-900">{selectedChatbot.name}</strong>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/dashboard"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 lg:hidden"
          >
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
