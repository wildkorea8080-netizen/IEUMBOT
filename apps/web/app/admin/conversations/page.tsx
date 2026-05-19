"use client";

import { Suspense, useState } from "react";
import { MessageSquare, BarChart2, ThumbsUp } from "lucide-react";
import { ConversationsManagement } from "../../../components/admin/conversations-management";
import QualityReportContent from "./quality-tab";
import FeedbackContent from "./feedback-tab";

const TABS = [
  { id: "logs",     label: "대화 로그",  icon: MessageSquare },
  { id: "metrics",  label: "운영 지표",  icon: BarChart2 },
  { id: "feedback", label: "피드백",     icon: ThumbsUp },
] as const;

type TabId = typeof TABS[number]["id"];

export default function ConversationsPage() {
  const [tab, setTab] = useState<TabId>("logs");

  return (
    <div>
      {/* 페이지 헤더 */}
      <div className="mb-2">
        <h1 className="section-title">대화 관리</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
          대화 로그, 운영 지표, 피드백을 한 곳에서 관리합니다.
        </p>
      </div>

      {/* 탭 바 */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 20, gap: 2 }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 18px", fontSize: 13.5,
                fontWeight: active ? 600 : 400,
                color: active ? "#2563eb" : "#6b7280",
                background: active ? "#eff6ff" : "transparent",
                border: "none",
                borderBottom: `2px solid ${active ? "#2563eb" : "transparent"}`,
                borderRadius: "8px 8px 0 0",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <Suspense fallback={<div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>불러오는 중...</div>}>
        {tab === "logs"     && <ConversationsManagement />}
        {tab === "metrics"  && <QualityReportContent />}
        {tab === "feedback" && <FeedbackContent />}
      </Suspense>
    </div>
  );
}
