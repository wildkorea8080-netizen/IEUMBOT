"use client";

import { useState } from "react";
import { MonitorSmartphone, Code2 } from "lucide-react";
import WidgetPage from "../widget/page";
import InstallGuidePage from "../install-guide/page";

const TABS = [
  { id: "widget",   label: "위젯 설정",   icon: MonitorSmartphone },
  { id: "install",  label: "설치 가이드", icon: Code2 },
] as const;

export default function WidgetInstallPage() {
  const [tab, setTab] = useState<"widget" | "install">("widget");

  return (
    <div>
      {/* 탭 헤더 */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 24, gap: 4 }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as "widget" | "install")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 18px", fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? "#2563eb" : "#6b7280",
                borderBottom: `2px solid ${active ? "#2563eb" : "transparent"}`,
                background: active ? "#eff6ff" : "transparent",
                border: "none",
                borderBottomWidth: 2, borderBottomStyle: "solid",
                borderBottomColor: active ? "#2563eb" : "transparent",
                cursor: "pointer",
                borderRadius: "8px 8px 0 0",
                transition: "all 0.15s",
              }}
            >
              <Icon style={{ width: 15, height: 15 }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "widget"  && <WidgetPage />}
      {tab === "install" && <InstallGuidePage />}
    </div>
  );
}
