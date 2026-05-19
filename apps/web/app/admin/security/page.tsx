"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ShieldAlert } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { apiClient } from "../../../lib/api/client";
import { getApiBaseUrl } from "../../../lib/api/base-url";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

type SecurityEventItem = {
  id: string; chatbotId: string; sessionId: string | null;
  eventType: string; severity: string; questionMasked: string;
  detectedPatterns: string[]; aiResponse: string | null; createdAt: string;
};
type Summary = { total: number; privacyExposure: number; abnormalAccess: number; inappropriate: number; negativeEmotion: number };
type ListResponse = { items: SecurityEventItem[]; total: number; summary: Summary };

function errMsg(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "오류가 발생했습니다.";
}
const EVENT_LABELS: Record<string, string> = {
  privacy_exposure: "개인정보 노출", abnormal_access: "비정상 접근",
  inappropriate: "부적절 발언", negative_emotion: "부정 감정",
};
function severityClass(s: string) { return s === "high" ? "badge-danger" : s === "medium" ? "badge-warning" : "badge-info"; }
function severityLabel(s: string) { return s === "high" ? "높음" : s === "medium" ? "보통" : "낮음"; }
function fmtDate(v: string) { return new Date(v).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
function rangeDate(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

const PERIOD_OPTIONS = [
  { label: "오늘", value: "today" }, { label: "1주일", value: "week" },
  { label: "1개월", value: "month" }, { label: "직접 지정", value: "custom" },
];

export default function SecurityPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<SecurityEventItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [eventType, setEventType] = useState("");
  const [sev, setSev] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { fromDate, toDate } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (period === "today") return { fromDate: today, toDate: today };
    if (period === "week")  return { fromDate: rangeDate(7), toDate: today };
    if (period === "month") return { fromDate: rangeDate(30), toDate: today };
    return { fromDate: customFrom, toDate: customTo };
  }, [period, customFrom, customTo]);

  useEffect(() => { void (async () => {
    try { const r = await getAdminChatbots(); setChatbots(r.items); if (r.items[0]) setChatbotId(r.items[0].id); }
    catch (e) { setError(errMsg(e)); }
  })(); }, []);

  useEffect(() => { void load(1); }, [chatbotId, fromDate, toDate, eventType, sev]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(p = page) {
    setIsLoading(true); setError(null);
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (chatbotId) q.set("chatbotId", chatbotId);
      if (eventType) q.set("eventType", eventType);
      if (sev) q.set("severity", sev);
      if (fromDate) q.set("from", fromDate);
      if (toDate) q.set("to", toDate);
      const res = await apiClient.request<ListResponse>(`/admin/security/events?${q.toString()}`);
      setItems(res.items); setTotal(res.total); setPage(p); setSummary(res.summary);
    } catch (e) { setError(errMsg(e)); } finally { setIsLoading(false); }
  }

  function exportCsv() {
    const q = new URLSearchParams();
    if (chatbotId) q.set("chatbotId", chatbotId);
    if (eventType) q.set("eventType", eventType);
    if (sev) q.set("severity", sev);
    if (fromDate) q.set("from", fromDate);
    if (toDate) q.set("to", toDate);
    window.open(`${getApiBaseUrl()}/admin/security/events/export?${q.toString()}`, "_blank");
  }

  const statCards = [
    { label: "총 보안 이벤트", value: summary?.total ?? 0, color: "#1e3a8a", bg: "#eff6ff", border: "#bfdbfe" },
    { label: "개인정보 노출",   value: summary?.privacyExposure ?? 0, color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    { label: "비정상 접근",     value: summary?.abnormalAccess ?? 0, color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    { label: "부적절 발언",     value: summary?.inappropriate ?? 0, color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
    { label: "부정 감정",       value: summary?.negativeEmotion ?? 0, color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  ];

  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert style={{ width: 20, height: 20, color: "#dc2626" }} />보안센터
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>개인정보 노출·비정상 접근·부적절 발언·부정 감정 이벤트를 모니터링합니다.</p>
        </div>
        <button type="button" onClick={exportCsv} className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px" }}>
          <Download style={{ width: 14, height: 14 }} />CSV 내보내기
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ borderRadius: 12, border: `1px solid ${s.border}`, background: s.bg, padding: 14 }}>
            <p style={{ fontSize: 11, color: "#64748b" }}>{s.label}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value.toLocaleString("ko-KR")}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} className="input-field" style={{ width: 170 }}>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ display: "flex", gap: 4 }}>
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setPeriod(opt.value)}
                className={period === opt.value ? "btn-primary" : "btn-secondary"} style={{ padding: "6px 12px", fontSize: 12 }}>
                {opt.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="input-field" style={{ width: 140 }} />
              <span style={{ color: "#94a3b8" }}>~</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="input-field" style={{ width: 140 }} />
            </>
          )}
          <select value={eventType} onChange={e => setEventType(e.target.value)} className="input-field" style={{ width: 140 }}>
            <option value="">전체 유형</option>
            <option value="privacy_exposure">개인정보 노출</option>
            <option value="abnormal_access">비정상 접근</option>
            <option value="inappropriate">부적절 발언</option>
            <option value="negative_emotion">부정 감정</option>
          </select>
          <select value={sev} onChange={e => setSev(e.target.value)} className="input-field" style={{ width: 110 }}>
            <option value="">전체 심각도</option>
            <option value="high">높음</option>
            <option value="medium">보통</option>
            <option value="low">낮음</option>
          </select>
          <button type="button" onClick={() => void load(1)} className="btn-primary" style={{ padding: "8px 16px" }}>검색</button>
        </div>
        {error && <p style={{ marginTop: 10, fontSize: 13, color: "#dc2626" }}>{error}</p>}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9", fontSize: 13, color: "#64748b" }}>
          {isLoading ? "불러오는 중..." : `총 ${total.toLocaleString("ko-KR")}건`}
        </div>
        {!isLoading && items.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>보안 이벤트가 없습니다.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="table-header" style={{ width: 120 }}>발생 일시</th>
                <th className="table-header">질문 내용 (마스킹)</th>
                <th className="table-header" style={{ width: 110 }}>유형</th>
                <th className="table-header" style={{ width: 80 }}>심각도</th>
                <th className="table-header">감지 패턴</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", background: item.severity === "high" ? "#fff5f5" : "white" }}>
                  <td className="table-cell" style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(item.createdAt)}</td>
                  <td className="table-cell">
                    <p style={{ color: "#1e293b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {item.questionMasked}
                    </p>
                  </td>
                  <td className="table-cell">
                    <span className="badge-neutral" style={{ fontSize: 11 }}>{EVENT_LABELS[item.eventType] ?? item.eventType}</span>
                  </td>
                  <td className="table-cell"><span className={severityClass(item.severity)}>{severityLabel(item.severity)}</span></td>
                  <td className="table-cell">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {item.detectedPatterns.slice(0, 4).map(p => (
                        <span key={p} style={{ fontSize: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, padding: "1px 6px", color: "#dc2626" }}>{p}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid #f1f5f9", fontSize: 13, color: "#64748b" }}>
            <span>{page} / {totalPages} 페이지</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)} className="btn-secondary" style={{ padding: "5px 14px", fontSize: 12, opacity: page <= 1 ? 0.4 : 1 }}>이전</button>
              <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)} className="btn-secondary" style={{ padding: "5px 14px", fontSize: 12, opacity: page >= totalPages ? 0.4 : 1 }}>다음</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
