"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Upload, BookOpen, AlertCircle,
  Bot, BotMessageSquare, Palette, Settings2, MonitorSmartphone, Code2,
  MessageSquare, ScrollText, BarChart2, ThumbsUp, HelpCircle, Zap, Plug2,
  TestTube2, Users, CreditCard, Shield, ChevronDown, LogOut,
} from "lucide-react";

import { adminNav } from "./admin-nav";
import {
  ADMIN_SELECTED_CHATBOT_EVENT,
  readSelectedAdminChatbot,
  type SelectedAdminChatbot,
} from "../../lib/admin-ui/selected-chatbot";
import {
  getSetupStatus,
  markSetupDone,
  SETUP_STATUS_EVENT,
  type SetupStatus,
} from "../../lib/admin-ui/setup-status";
import { getAdminChatbots } from "../../lib/api/admin-operations";
import { getAdminInstallGuide } from "../../lib/api/install-guide";
import {
  getOrganizationBranding,
  ORG_BRANDING_EVENT,
  type OrganizationBranding,
} from "../../lib/api/organization";
import { apiClient } from "../../lib/api";
import { clearAdminAccessToken } from "../../lib/auth/token";
import { useRouter } from "next/navigation";

const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  LayoutDashboard, Upload, BookOpen, AlertCircle,
  Bot, BotMessageSquare, Palette, Settings2, MonitorSmartphone, Code2,
  MessageSquare, ScrollText, BarChart2, ThumbsUp, HelpCircle, Zap, Plug2,
  TestTube2, Users, CreditCard, Shield,
};

function NavIcon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = ICON_MAP[name];
  return Icon ? <Icon className={className} style={style} /> : null;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [selectedChatbot, setSelectedChatbot] = useState<SelectedAdminChatbot | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus>({});
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);

  // 기관 로고 — 최초 1회 조회 + 설정 페이지에서 변경 시 즉시 반영
  useEffect(() => {
    let mounted = true;
    void getOrganizationBranding()
      .then((res) => {
        if (mounted) setBranding(res);
      })
      .catch(() => {
        /* 미인증/오류 시 기본 마크 유지 */
      });
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<OrganizationBranding>).detail;
      if (detail) setBranding(detail);
    };
    window.addEventListener(ORG_BRANDING_EVENT, onUpdate);
    return () => {
      mounted = false;
      window.removeEventListener(ORG_BRANDING_EVENT, onUpdate);
    };
  }, []);

  useEffect(() => {
    function sync() {
      setSelectedChatbot(readSelectedAdminChatbot());
    }
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(ADMIN_SELECTED_CHATBOT_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ADMIN_SELECTED_CHATBOT_EVENT, sync as EventListener);
    };
  }, []);

  useEffect(() => {
    function syncSetup() {
      setSetupStatus({ ...getSetupStatus() });
    }
    syncSetup();
    window.addEventListener(SETUP_STATUS_EVENT, syncSetup);
    window.addEventListener("storage", syncSetup);

    // API로 완료 여부 자동 감지 (최초 1회)
    void (async () => {
      try {
        const [chatbotRes, installRes] = await Promise.all([
          getAdminChatbots().catch(() => null),
          getAdminInstallGuide().catch(() => null),
        ]);
        if (chatbotRes && chatbotRes.items.length > 0) {
          markSetupDone("ai_basic");
          markSetupDone("ai_style");
        }
        if (installRes && installRes.items.some(i => i.allowedDomains.length > 0)) {
          markSetupDone("install");
        }
      } catch { /* silently ignore */ }
    })();

    return () => {
      window.removeEventListener(SETUP_STATUS_EVENT, syncSetup);
      window.removeEventListener("storage", syncSetup);
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

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen overflow-y-auto"
      style={{ width: 232, background: "#fff", borderRight: "1px solid #f0f0f0" }}
    >
      {/* 로고 — 기관 로고가 있으면 그것으로 교체, 없으면 기본 이음봇 마크 */}
      <div
        className="flex items-center shrink-0"
        style={{
          height: 60, padding: "0 16px",
          background: branding?.logoUrl ? "#fff" : "#2563eb",
          borderBottom: branding?.logoUrl ? "1px solid #f0f0f0" : "none",
        }}
      >
        {branding?.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.organizationName || "기관 로고"}
            style={{ maxHeight: 40, maxWidth: 180, objectFit: "contain" }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 900, color: "#fff",
            }}>
              이
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
              이음봇
            </span>
          </div>
        )}
      </div>

      {/* 챗봇 선택기 — 플래니 스타일 */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 10px", background: "#f5f7fa", borderRadius: 8, cursor: "default",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              현재 챗봇
            </span>
            <span
              className="truncate"
              style={{ fontSize: 13, color: "#111827", fontWeight: 600, marginTop: 1 }}
            >
              {selectedChatbot?.name ?? "챗봇을 선택하세요"}
            </span>
          </div>
          <ChevronDown className="shrink-0 ml-1" style={{ width: 13, height: 13, color: "#9ca3af" }} />
        </div>
      </div>

      {/* 네비게이션 — 플래니 스타일 */}
      <nav className="flex-1" style={{ padding: "6px 0", overflowY: "auto" }}>
        {adminNav.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 4 }}>
            {group.title ? (
              <p
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  padding: "12px 16px 4px",
                }}
              >
                {group.title}
              </p>
            ) : null}

            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 transition-all"
                  style={{
                    padding: "7px 10px",
                    margin: "1px 8px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#2563eb" : "#6b7280",
                    background: isActive ? "#eff6ff" : "transparent",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f5f7fa";
                      e.currentTarget.style.color = "#111827";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#6b7280";
                    }
                  }}
                >
                  {/* 활성 항목은 파란 세로 막대 */}
                  {isActive && (
                    <span style={{
                      position: "absolute", left: 8, width: 3, height: 20,
                      background: "#2563eb", borderRadius: 2,
                    }} />
                  )}
                  <NavIcon
                    name={item.icon}
                    style={{
                      width: 15,
                      height: 15,
                      color: isActive ? "#2563eb" : "#9ca3af",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge ? (
                    <span style={{ fontSize: 10, fontWeight: 600, background: "#dbeafe", color: "#1d4ed8", borderRadius: 10, padding: "1px 7px" }}>
                      {item.badge}
                    </span>
                  ) : null}
                  {item.setupKey && !setupStatus[item.setupKey] ? (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#fef2f2", color: "#ef4444", borderRadius: 6, padding: "1px 6px", border: "1px solid #fecaca" }}>
                      미완료
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 하단 로그아웃 */}
      <div style={{ borderTop: "1px solid #f1f5f9", padding: 12 }}>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 transition-colors hover:bg-neutral-100 rounded-lg"
          style={{
            padding: "8px 12px",
            fontSize: 13,
            color: "#64748b",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <LogOut style={{ width: 14, height: 14 }} />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
}
