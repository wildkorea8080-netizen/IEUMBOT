"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, KeyRound, MessageCircle } from "lucide-react";

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
import { adminNav } from "./admin-nav";

function findPageTitle(pathname: string): string {
  for (const group of adminNav) {
    for (const item of group.items) {
      if (pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href))) {
        return item.label;
      }
    }
  }
  return "";
}

export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const routeMeta = getAdminRouteMeta(pathname);
  const pageTitle = findPageTitle(pathname);

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
      // ignore
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
    <header
      className="sticky top-0 z-30 bg-white flex flex-col"
      style={{ borderBottom: "1px solid #e2e8f0" }}
    >
      {/* 대리 접속 배너 */}
      {impersonation ? (
        <div style={{ borderBottom: "1px solid #fcd34d", background: "#fffbeb", padding: "10px 24px" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#78350f", margin: 0 }}>
                대리 접속 중: {impersonation.organizationName}
              </p>
              <p style={{ fontSize: 12, color: "#92400e", margin: 0 }}>
                사유: {impersonation.reason} | 만료: {new Date(impersonation.expiresAt).toLocaleString("ko-KR")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleEndImpersonation}
              disabled={isEndingImpersonation}
              className="transition-colors"
              style={{
                border: "1px solid #fcd34d",
                background: "white",
                borderRadius: 8,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "#92400e",
                cursor: "pointer",
                opacity: isEndingImpersonation ? 0.6 : 1,
              }}
            >
              {isEndingImpersonation ? "종료 중..." : "종료"}
            </button>
          </div>
          {impersonationError && (
            <p style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>{impersonationError}</p>
          )}
        </div>
      ) : null}

      {/* 메인 헤더 바 */}
      <div
        className="flex items-center justify-between"
        style={{ height: 64, padding: "0 24px" }}
      >
        {/* 왼쪽: 페이지 타이틀 */}
        <div className="flex flex-col min-w-0">
          {routeMeta.breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
              {routeMeta.breadcrumbs.map((item, index) => (
                <span key={`${item}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <span style={{ color: "#cbd5e1", fontSize: 12 }}>/</span>
                  )}
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{item}</span>
                </span>
              ))}
            </div>
          )}
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: 0, lineHeight: 1.3 }}>
            {pageTitle || routeMeta.title}
          </h1>
        </div>

        {/* 오른쪽: 액션 그룹 */}
        <div className="flex items-center" style={{ gap: 8 }}>
          {/* 챗봇 테스트 버튼 */}
          <Link
            href="/admin/test-chat"
            className="flex items-center gap-1.5 transition-colors hover:bg-neutral-50"
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              color: "#475569",
              textDecoration: "none",
              background: "white",
            }}
          >
            <MessageCircle style={{ width: 14, height: 14 }} />
            <span>챗봇 테스트</span>
          </Link>

          {/* 알림 버튼 */}
          <Link
            href="/admin/notifications"
            className="flex items-center justify-center transition-colors hover:bg-neutral-100"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              color: "#64748b",
              textDecoration: "none",
            }}
          >
            <Bell style={{ width: 18, height: 18 }} />
          </Link>

          {/* 선택된 챗봇 */}
          {selectedChatbot && (
            <span
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                color: "#1d4ed8",
                fontWeight: 500,
              }}
            >
              {selectedChatbot.name}
            </span>
          )}

          {/* 로그아웃 */}
          <Link
            href="/admin/change-password"
            className="flex items-center gap-1.5 transition-colors hover:bg-neutral-50"
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              color: "#475569",
              textDecoration: "none",
              background: "white",
            }}
          >
            <KeyRound style={{ width: 14, height: 14 }} />
            <span>비밀번호 변경</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="transition-colors hover:bg-neutral-50"
            style={{
              border: "1px solid #e2e8f0",
              background: "white",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              color: "#475569",
              cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
