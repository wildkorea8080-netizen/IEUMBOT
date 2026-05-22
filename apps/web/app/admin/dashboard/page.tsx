"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users, MessageSquare, CheckCircle, Clock,
  ChevronRight, RefreshCw,
} from "lucide-react";

import { StatCard } from "../../../components/ui/stat-card";
import { ApiClientError } from "../../../lib/api";
import {
  getDashboardQuestionTypes,
  getDashboardRecentChats,
  getDashboardSummary,
  getDashboardUsageTrend,
} from "../../../lib/api/admin-operations";
import { apiClient } from "../../../lib/api/client";
import type {
  DashboardQuestionTypeItem,
  DashboardRecentChatItem,
  DashboardSummaryResponse,
  DashboardUsageTrendItem,
} from "../../../lib/api/admin-operations-types";

// ── 유틸 ─────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function thisMonday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function thisMonthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function formatChartDate(v: string) {
  return v.slice(5).replace("-", ".");
}
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "대시보드 데이터를 불러오지 못했습니다.";
}

// 최근 대화 상태 → badge 스타일
function chatBadge(status: DashboardRecentChatItem["status"]) {
  if (status === "success")    return { bg: "#f0fdf4", color: "#16a34a", label: "답변성공" };
  if (status === "escalation") return { bg: "#f1f5f9", color: "#64748b", label: "이관" };
  return                               { bg: "#fffbeb", color: "#d97706", label: "근거부족" };
}

// 질문유형 바 색상
const BAR_COLORS = ["#2563eb", "#60a5fa", "#bfdbfe", "#e2e8f0", "#e2e8f0"];

// ── 컴포넌트 ─────────────────────────────────────────────

export default function DashboardPage() {
  const today = todayStr();
  const [startDate, setStartDate] = useState(daysAgoStr(29));
  const [endDate, setEndDate]     = useState(today);
  const [pending, setPending]     = useState({ start: daysAgoStr(29), end: today });

  const [summary, setSummary]         = useState<DashboardSummaryResponse | null>(null);
  const [usageTrend, setUsageTrend]   = useState<DashboardUsageTrendItem[]>([]);
  const [questionTypes, setQuestionTypes] = useState<DashboardQuestionTypeItem[]>([]);
  const [recentChats, setRecentChats] = useState<DashboardRecentChatItem[]>([]);
  const [secSummary, setSecSummary]   = useState<{ total: number; privacyExposure: number; abnormalAccess: number; inappropriate: number; negativeEmotion: number } | null>(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const range = useMemo(() => ({ from: startDate, to: endDate }), [startDate, endDate]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [s, u, q, r, sec] = await Promise.all([
        getDashboardSummary(),
        getDashboardUsageTrend(range),
        getDashboardQuestionTypes(range),
        getDashboardRecentChats({ limit: 8 }),
        apiClient.request<{ items: unknown[]; total: number; summary: { total: number; privacyExposure: number; abnormalAccess: number; inappropriate: number; negativeEmotion: number } }>(
          "/admin/security/events?page=1&pageSize=1"
        ).catch(() => null),
      ]);
      setSummary(s);
      setUsageTrend(u);
      setQuestionTypes(q);
      setRecentChats(r);
      if (sec) setSecSummary(sec.summary);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleApply = () => {
    setStartDate(pending.start);
    setEndDate(pending.end);
  };

  const setPreset = (type: "today" | "week" | "month") => {
    const presets = {
      today: { start: today, end: today },
      week:  { start: thisMonday(), end: today },
      month: { start: thisMonthStart(), end: today },
    };
    setPending(presets[type]);
    setStartDate(presets[type].start);
    setEndDate(presets[type].end);
  };

  const totalQType = questionTypes.reduce((s, t) => s + t.count, 0);
  const usagePercent = summary ? Math.min(100, Math.round((summary.totalConversations / Math.max(summary.totalConversations, 1)) * 100)) : 0;

  return (
    <div className="space-y-4">

      {/* ── 상단 필터 바 ── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-4 flex flex-wrap items-center gap-3">
        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>조회기간</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={pending.start}
            max={pending.end}
            onChange={e => setPending(p => ({ ...p, start: e.target.value }))}
            className="input-field"
            style={{ width: 140 }}
          />
          <span style={{ color: "#94a3b8", fontSize: 13 }}>~</span>
          <input
            type="date"
            value={pending.end}
            min={pending.start}
            max={today}
            onChange={e => setPending(p => ({ ...p, end: e.target.value }))}
            className="input-field"
            style={{ width: 140 }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(["today", "week", "month"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setPreset(preset)}
              className="btn-secondary"
              style={{ padding: "5px 10px", fontSize: 12 }}
            >
              {{ today: "오늘", week: "이번주", month: "이번달" }[preset]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleApply}
          disabled={isLoading}
          className="btn-primary ml-auto flex items-center gap-1.5"
          style={{ padding: "6px 14px" }}
        >
          <RefreshCw style={{ width: 13, height: 13 }} />
          조회하기
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* ── 지표 카드 4개 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="총 사용자 수"
          value={summary?.totalUsers ?? "—"}
          icon={<Users style={{ width: 18, height: 18 }} />}
          color="blue"
        />
        <StatCard
          label="총 대화 수"
          value={summary?.totalConversations ?? "—"}
          icon={<MessageSquare style={{ width: 18, height: 18 }} />}
          color="green"
        />
        <StatCard
          label="답변 성공률"
          value={summary ? `${summary.successRate}%` : "—"}
          icon={<CheckCircle style={{ width: 18, height: 18 }} />}
          color="blue"
        />
        <StatCard
          label="평균 응답시간"
          value={summary ? `${summary.avgResponseTime}초` : "—"}
          icon={<Clock style={{ width: 18, height: 18 }} />}
          color="orange"
        />
      </div>

      {/* ── 중단: 차트 + 월간 사용량 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">

        {/* 사용량 추이 차트 */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: 0 }}>사용량 추이</h2>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{startDate} ~ {endDate}</span>
          </div>

          {isLoading ? (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
              불러오는 중...
            </div>
          ) : usageTrend.length === 0 ? (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
              데이터가 없습니다
            </div>
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={usageTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="#94a3b8" tickLine={false} axisLine={false} style={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} style={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                    labelFormatter={l => `${l}`}
                  />
                  <Line type="monotone" dataKey="messages" name="대화" stroke="#2563eb" strokeWidth={2} dot={{ r: 2, fill: "white", stroke: "#2563eb" }} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="users"    name="사용자" stroke="#16a34a" strokeWidth={2} dot={{ r: 2, fill: "white", stroke: "#16a34a" }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 월간 사용량 프로그레스 */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-5 flex flex-col">
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: 0, marginBottom: 4 }}>월간 대화 사용량</h2>
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 20px" }}>{thisMonthStart()} ~ {today}</p>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
              <span>이번 달 대화</span>
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{summary?.totalConversations ?? 0}건</span>
            </div>

            {/* 프로그레스바 */}
            <div style={{ background: "#f1f5f9", borderRadius: 99, height: 10, overflow: "hidden" }}>
              <div
                style={{
                  width: `${usagePercent}%`,
                  height: "100%",
                  background: "#2563eb",
                  borderRadius: 99,
                  transition: "width 0.6s ease",
                }}
              />
            </div>

            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              {summary?.totalConversations ?? 0}건 / 무제한
            </p>
          </div>

          <div style={{ borderTop: "1px solid #f1f5f9", marginTop: 20, paddingTop: 16 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>총 사용자</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{summary?.totalUsers ?? 0}<span style={{ fontSize: 13, fontWeight: 400, color: "#94a3b8", marginLeft: 4 }}>명</span></div>
          </div>
        </div>
      </div>

      {/* ── 하단: 질문 유형 + 최근 대화 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 질문 유형 Top 5 */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: 0 }}>질문 유형 Top 5</h2>
            <Link href="/admin/quality-report" style={{ fontSize: 12, color: "#2563eb", display: "flex", alignItems: "center", gap: 2, textDecoration: "none" }}>
              전체 보기 <ChevronRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>

          {isLoading ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>불러오는 중...</div>
          ) : questionTypes.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>데이터가 없습니다</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {questionTypes.slice(0, 5).map((item, i) => {
                const pct = totalQType > 0 ? Math.round((item.count / totalQType) * 100) : 0;
                return (
                  <div key={item.label} style={{ paddingTop: 10, paddingBottom: 10, borderBottom: i < 4 ? "1px solid #f1f5f9" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%",
                          background: BAR_COLORS[i] ?? "#e2e8f0",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: i < 2 ? "white" : "#64748b",
                          flexShrink: 0,
                        }}>
                          {i + 1}
                        </div>
                        <span style={{ fontSize: 13, color: "#334155" }}>{item.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{item.count}</span>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ background: "#f1f5f9", borderRadius: 99, height: 4 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: BAR_COLORS[i] ?? "#e2e8f0", borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 최근 대화 목록 */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: 0 }}>최근 대화</h2>
            <Link href="/admin/conversations" style={{ fontSize: 12, color: "#2563eb", display: "flex", alignItems: "center", gap: 2, textDecoration: "none" }}>
              전체 보기 <ChevronRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>

          {isLoading ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>불러오는 중...</div>
          ) : recentChats.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>최근 대화가 없습니다</div>
          ) : (
            <div>
              {recentChats.map((item, i) => {
                const badge = chatBadge(item.status);
                return (
                  <div
                    key={`${item.createdAt}-${i}`}
                    style={{
                      padding: "10px 0",
                      borderBottom: i < recentChats.length - 1 ? "1px solid #f1f5f9" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        {new Date(item.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        background: badge.bg, color: badge.color,
                        padding: "2px 8px", borderRadius: 99,
                      }}>
                        {badge.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "#334155", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.question ?? "질문 내용이 없습니다."}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 보안현황 ── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-card" style={{ padding: "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>보안현황</span>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>부적절한 질문은 정책에 의해 자동 차단되며, 안전한 거부 메시지로 안내됩니다.</span>
        </div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          {[
            { label: "총 보안 이벤트",      value: secSummary?.total ?? 0,            icon: "🛡️" },
            { label: "개인정보 노출 위험",   value: secSummary?.privacyExposure ?? 0,  icon: "👤" },
            { label: "비정상 행동",          value: secSummary?.abnormalAccess ?? 0,   icon: "⚠️" },
            { label: "부적절 발언 (비방/혐오)", value: secSummary?.inappropriate ?? 0, icon: "🚫" },
            { label: "부정 감정 (불만)",      value: secSummary?.negativeEmotion ?? 0, icon: "😞" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#111827", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, whiteSpace: "nowrap" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
