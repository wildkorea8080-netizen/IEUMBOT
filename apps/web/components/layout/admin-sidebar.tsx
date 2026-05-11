"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Upload, BookOpen, AlertCircle,
  Bot, BotMessageSquare, Palette, Settings2, MonitorSmartphone, Code2,
  MessageSquare, ScrollText, BarChart2, ThumbsUp,
  Users, CreditCard, Shield, ChevronDown, LogOut,
} from "lucide-react";

import { adminNav } from "./admin-nav";
import {
  ADMIN_SELECTED_CHATBOT_EVENT,
  readSelectedAdminChatbot,
  type SelectedAdminChatbot,
} from "../../lib/admin-ui/selected-chatbot";
import { apiClient } from "../../lib/api";
import { clearAdminAccessToken } from "../../lib/auth/token";
import { useRouter } from "next/navigation";

const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  LayoutDashboard, Upload, BookOpen, AlertCircle,
  Bot, BotMessageSquare, Palette, Settings2, MonitorSmartphone, Code2,
  MessageSquare, ScrollText, BarChart2, ThumbsUp,
  Users, CreditCard, Shield,
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
      className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen overflow-y-auto bg-white"
      style={{ width: 240, borderRight: "1px solid #e2e8f0" }}
    >
      {/* 로고 */}
      <div
        className="flex items-center shrink-0"
        style={{ height: 64, paddingLeft: 20, borderBottom: "1px solid #f1f5f9" }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, color: "#1d4ed8", letterSpacing: "-0.02em" }}>
          IEUMBOT
        </span>
      </div>

      {/* 챗봇 선택기 */}
      <div style={{ padding: "8px 12px" }}>
        <div
          className="flex items-center justify-between cursor-pointer hover:bg-neutral-100 transition-colors"
          style={{
            padding: "10px 12px",
            background: "#f8fafc",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div className="flex flex-col min-w-0">
            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              현재 챗봇
            </span>
            <span
              className="truncate"
              style={{ color: "#334155", fontWeight: 500, marginTop: 1 }}
            >
              {selectedChatbot?.name ?? "챗봇을 선택하세요"}
            </span>
          </div>
          <ChevronDown className="shrink-0 ml-1" style={{ width: 14, height: 14, color: "#94a3b8" }} />
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1" style={{ padding: "8px 0" }}>
        {adminNav.map((group, gi) => (
          <div key={gi}>
            {group.title ? (
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "16px 20px 4px",
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
                  className="flex items-center gap-3 transition-colors"
                  style={{
                    padding: "8px 16px",
                    margin: "1px 8px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#1d4ed8" : "#475569",
                    background: isActive ? "#eff6ff" : "transparent",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f1f5f9";
                      e.currentTarget.style.color = "#1e293b";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#475569";
                    }
                  }}
                >
                  <NavIcon
                    name={item.icon}
                    style={{
                      width: 16,
                      height: 16,
                      color: isActive ? "#2563eb" : "#94a3b8",
                      flexShrink: 0,
                    }}
                  />
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span
                      className="ml-auto"
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        background: "#dbeafe",
                        color: "#1d4ed8",
                        borderRadius: 10,
                        padding: "1px 6px",
                      }}
                    >
                      {item.badge}
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
