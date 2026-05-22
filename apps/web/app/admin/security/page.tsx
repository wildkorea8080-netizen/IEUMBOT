"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { apiClient } from "../../../lib/api/client";
import { getApiBaseUrl } from "../../../lib/api/base-url";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type SecurityEventItem = {
  id: string; chatbotId: string; sessionId: string | null;
  eventType: string; severity: string; questionMasked: string;
  detectedPatterns: string[]; aiResponse: string | null; createdAt: string;
};
type Summary = { total: number; privacyExposure: number; abnormalAccess: number; inappropriate: number; negativeEmotion: number };
type ListResponse = { items: SecurityEventItem[]; total: number; summary: Summary };

function errMsg(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : "오류가 발생했습니다.";
}

function fmtDate(v: string) {
  return new Date(v).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function rangeDate(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10);
}

type Period = "today" | "yesterday" | "week7" | "month30" | "custom";

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "오늘", value: "today" },
  { label: "어제", value: "yesterday" },
  { label: "최근 7일", value: "week7" },
  { label: "최근 30일", value: "month30" },
];

const CATEGORY_OPTIONS = [
  { label: "전체 카테고리", value: "" },
  { label: "개인정보 노출 위험", value: "privacy_exposure" },
  { label: "비정상 행동", value: "abnormal_access" },
  { label: "부적절 발언", value: "inappropriate" },
  { label: "부정 감정", value: "negative_emotion" },
];

const SEVERITY_OPTIONS = [
  { label: "전체 심각도", value: "" },
  { label: "높음", value: "high" },
  { label: "보통", value: "medium" },
  { label: "낮음", value: "low" },
];

const CATEGORY_LABELS: Record<string, string> = {
  privacy_exposure: "개인정보 노출 위험",
  abnormal_access: "비정상 행동",
  inappropriate: "부적절 발언",
  negative_emotion: "부정 감정",
};

function severityLabel(s: string) { return s === "high" ? "높음" : s === "medium" ? "보통" : "낮음"; }
function severityColor(s: string) {
  if (s === "high") return { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
  if (s === "medium") return { color: "#d97706", bg: "#fffbeb", border: "#fde68a" };
  return { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" };
}

// ── 보안현황 아이콘 SVG ───────────────────────────────────────────────────────

const STAT_ICONS = {
  total: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2L3 5v5c0 4 3.1 7.7 7 9 3.9-1.3 7-5 7-9V5l-7-3z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  privacy: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="8" r="3" stroke="white" strokeWidth="1.5" />
      <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  abnormal: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3v7M10 13v1" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.5" />
    </svg>
  ),
  inappropriate: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 10l3 3 7-7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.5" />
    </svg>
  ),
  negative: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.5" />
      <path d="M7 13c1-1.5 5-1.5 6 0M7.5 8h.5M12 8h.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

// ── 메인 ──────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<SecurityEventItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { fromDate, toDate } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (period === "today") return { fromDate: today, toDate: today };
    if (period === "yesterday") return { fromDate: rangeDate(1), toDate: rangeDate(1) };
    if (period === "week7") return { fromDate: rangeDate(7), toDate: today };
    if (period === "month30") return { fromDate: rangeDate(30), toDate: today };
    return { fromDate: customFrom, toDate: customTo };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await getAdminChatbots();
        if (r.items[0]) setChatbotId(r.items[0].id);
      } catch (e) { setError(errMsg(e)); }
    })();
  }, []);

  useEffect(() => { void load(1); }, [chatbotId, fromDate, toDate, category, severity]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(p = page) {
    setIsLoading(true); setError(null);
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (chatbotId) q.set("chatbotId", chatbotId);
      if (category) q.set("eventType", category);
      if (severity) q.set("severity", severity);
      if (fromDate) q.set("from", fromDate);
      if (toDate) q.set("to", toDate);
      const res = await apiClient.request<ListResponse>(`/admin/security/events?${q.toString()}`);
      setItems(res.items); setTotal(res.total); setPage(p); setSummary(res.summary);
    } catch (e) { setError(errMsg(e)); }
    finally { setIsLoading(false); }
  }

  function exportCsv() {
    const q = new URLSearchParams();
    if (chatbotId) q.set("chatbotId", chatbotId);
    if (category) q.set("eventType", category);
    if (severity) q.set("severity", severity);
    if (fromDate) q.set("from", fromDate);
    if (toDate) q.set("to", toDate);
    window.open(`${getApiBaseUrl()}/admin/security/events/export?${q.toString()}`, "_blank");
  }

  const stats = [
    { key: "total",       icon: STAT_ICONS.total,       label: "총 보안 이벤트",            value: summary?.total ?? 0 },
    { key: "privacy",     icon: STAT_ICONS.privacy,     label: "개인정보 노출 위험",         value: summary?.privacyExposure ?? 0 },
    { key: "abnormal",    icon: STAT_ICONS.abnormal,    label: "비정상 행동",               value: summary?.abnormalAccess ?? 0 },
    { key: "inappropriate", icon: STAT_ICONS.inappropriate, label: "부적절 발언 (비방/혐오)", value: summary?.inappropriate ?? 0 },
    { key: "negative",    icon: STAT_ICONS.negative,    label: "부정 감정 (불만)",           value: summary?.negativeEmotion ?? 0 },
  ];

  const filteredItems = searchQuery
    ? items.filter(i => i.questionMasked.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── 필터 바 ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "14px 20px" }}>
        {/* 날짜 + 카테고리 + 심각도 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setPeriod(opt.value)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: `1.5px solid ${period === opt.value ? "#111827" : "#e5e7eb"}`,
                background: period === opt.value ? "#111827" : "#fff",
                color: period === opt.value ? "#fff" : "#374151",
              }}>
              {opt.label}
            </button>
          ))}
          <div style={{ width: 1, background: "#e5e7eb", margin: "0 4px" }} />
          <select value={category} onChange={e => { setCategory(e.target.value); void load(1); }}
            style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}>
            {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={severity} onChange={e => { setSeverity(e.target.value); void load(1); }}
            style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}>
            {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* 기간 직접 입력 */}
        {period === "custom" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }} />
            <span style={{ alignSelf: "center", color: "#9ca3af" }}>~</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }} />
          </div>
        )}

        {/* 검색 */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="내용으로 검색하세요."
            style={{ flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, outline: "none", color: "#374151" }}
          />
          <button type="button" onClick={() => void load(1)}
            style={{ padding: "10px 20px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", fontSize: 13, fontWeight: 500, color: "#374151", cursor: "pointer" }}>
            검색
          </button>
        </div>
        {error && <p style={{ marginTop: 10, fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</p>}
      </div>

      {/* ── 보안현황 ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>보안현황</span>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>부적절한 질문은 정책에 의해 자동 차단되며, 안전한 거부 메시지로 안내됩니다.</span>
        </div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          {stats.map(s => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#111827", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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

      {/* ── 보안 이벤트 테이블 ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>보안 이벤트</h2>
          <button type="button" onClick={exportCsv}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, color: "#374151", cursor: "pointer" }}>
            <Download style={{ width: 13, height: 13 }} />CSV 내보내기
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>보안 이벤트가 없습니다.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {["시간", "카테고리", "유형", "내용 미리보기", "심각도"].map(col => (
                  <th key={col} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280", background: "#f9fafb" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const sev = severityColor(item.severity);
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "14px 16px", color: "#9ca3af", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(item.createdAt)}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: 12, background: "#f1f5f9", color: "#475569", borderRadius: 4, padding: "2px 8px", fontWeight: 500 }}>
                        {CATEGORY_LABELS[item.eventType] ?? item.eventType}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: "#6b7280" }}>
                      {item.detectedPatterns.slice(0, 2).join(", ") || "-"}
                    </td>
                    <td style={{ padding: "14px 16px", maxWidth: 400 }}>
                      <div style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.questionMasked}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, background: sev.bg, color: sev.color, borderRadius: 6, padding: "2px 8px", border: `1px solid ${sev.border}` }}>
                        {severityLabel(item.severity)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* 푸터 */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>총 {total}건</span>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)}
                style={{ padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 13, color: page <= 1 ? "#d1d5db" : "#374151", cursor: page <= 1 ? "not-allowed" : "pointer" }}>
                이전
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                <button key={p} type="button" onClick={() => void load(p)}
                  style={{ width: 32, height: 32, border: `1.5px solid ${p === page ? "#111827" : "#e5e7eb"}`, borderRadius: 6, background: p === page ? "#111827" : "#fff", fontSize: 13, color: p === page ? "#fff" : "#374151", cursor: "pointer" }}>
                  {p}
                </button>
              ))}
              <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)}
                style={{ padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 13, color: page >= totalPages ? "#d1d5db" : "#374151", cursor: page >= totalPages ? "not-allowed" : "pointer" }}>
                다음
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
