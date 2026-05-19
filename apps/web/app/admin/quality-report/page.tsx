"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileEdit } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots, getAdminQualityReport } from "../../../lib/api/admin-operations";
import type {
  AdminChatbotItem,
  AdminQualityQuestionItem,
  AdminQualityReportResponse,
} from "../../../lib/api/admin-operations-types";

function rangeDate(days: number): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "품질 리포트를 불러오지 못했습니다.";
}

function fmt(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}
function fmtPct(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(1)}%`;
}
function fmtScore(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toFixed(3);
}
function fmtLatency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}ms`;
}
function fmtDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function scoreColor(score?: number | null): string {
  if (typeof score !== "number") return "#94a3b8";
  if (score >= 0.7) return "#16a34a";
  if (score >= 0.45) return "#d97706";
  return "#dc2626";
}
function outcomeClass(outcome?: string | null): string {
  if (!outcome) return "badge-neutral";
  if (outcome === "answered") return "badge-success";
  if (outcome === "insufficient_evidence") return "badge-warning";
  if (outcome === "escalated") return "badge-info";
  return "badge-danger";
}

type MetricCardProps = { label: string; value: string; helper?: string; color?: "default" | "green" | "red" | "orange" };
function MetricCard({ label, value, helper, color = "default" }: MetricCardProps) {
  const bg = color === "green" ? "#f0fdf4" : color === "red" ? "#fef2f2" : color === "orange" ? "#fffbeb" : "white";
  const border = color === "green" ? "#bbf7d0" : color === "red" ? "#fecaca" : color === "orange" ? "#fde68a" : "#e2e8f0";
  const valueColor = color === "green" ? "#16a34a" : color === "red" ? "#dc2626" : color === "orange" ? "#d97706" : "#0f172a";
  return (
    <article style={{ borderRadius: 12, border: `1px solid ${border}`, background: bg, padding: 16 }}>
      <p style={{ fontSize: 12, color: "#64748b" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: valueColor, marginTop: 6 }}>{value}</p>
      {helper && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{helper}</p>}
    </article>
  );
}

function QuestionTable({ title, description, rows, emptyText }: { title: string; description: string; rows: AdminQualityQuestionItem[]; emptyText: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>{title}</h3>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{description}</p>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th className="table-header" style={{ width: 100 }}>시간</th>
            <th className="table-header">질문</th>
            <th className="table-header" style={{ width: 100 }}>상태</th>
            <th className="table-header" style={{ width: 80 }}>점수</th>
            <th className="table-header" style={{ width: 64 }}>프롬프트</th>
            <th className="table-header" style={{ width: 64 }}>출처</th>
            <th className="table-header" style={{ width: 72 }}>지식 등록</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="table-cell" style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>{emptyText}</td></tr>
          ) : (
            rows.map((item, i) => (
              <tr key={`${item.createdAt}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td className="table-cell" style={{ color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(item.createdAt)}</td>
                <td className="table-cell">
                  <p style={{ color: "#1e293b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.question ?? "-"}</p>
                  {item.fallbackReason && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{item.fallbackReason}</p>}
                </td>
                <td className="table-cell"><span className={outcomeClass(item.outcome)}>{item.outcome ?? "-"}</span></td>
                <td className="table-cell" style={{ color: scoreColor(item.topScore), fontWeight: 600 }}>{fmtScore(item.topScore)}</td>
                <td className="table-cell" style={{ textAlign: "center", color: "#475569" }}>{fmt(item.usedInPromptCount)}</td>
                <td className="table-cell" style={{ textAlign: "center", color: "#475569" }}>{fmt(item.citationCount)}</td>
                <td className="table-cell">
                  <Link href={`/admin/knowledge?q=${encodeURIComponent(item.question ?? "")}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", textDecoration: "none" }}>
                    <FileEdit style={{ width: 13, height: 13 }} />등록
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminQualityReportPage() {
  const initialRange = useMemo(() => rangeDate(30), []);
  const [report, setReport] = useState<AdminQualityReportResponse | null>(null);
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [fallbackOnly, setFallbackOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setIsLoading(true); setError(null);
    try {
      const [reportRes, chatbotRes] = await Promise.all([
        getAdminQualityReport({ chatbotId: chatbotId || undefined, startDate, endDate, fallbackOnly }),
        getAdminChatbots(),
      ]);
      setReport(reportRes); setChatbots(chatbotRes.items);
    } catch (err) { setError(errorMessage(err)); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { void loadReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answeredRate = report?.totalConversations ? (report.answeredCount / report.totalConversations) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} className="input-field" style={{ width: 180 }}>
            <option value="">전체 챗봇</option>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field" style={{ width: 148 }} aria-label="시작일" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field" style={{ width: 148 }} aria-label="종료일" />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={fallbackOnly} onChange={e => setFallbackOnly(e.target.checked)} style={{ width: 15, height: 15, accentColor: "#2563eb" }} />fallback만 보기
          </label>
          <button type="button" onClick={() => void loadReport()} className="btn-primary" style={{ padding: "8px 20px", marginLeft: "auto" }}>조회</button>
        </div>
        {error && <p style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#dc2626" }}>{error}</p>}
        {isLoading && <p style={{ marginTop: 12, fontSize: 13, color: "#94a3b8" }}>품질 데이터를 불러오는 중...</p>}
        {!isLoading && report?.totalConversations === 0 && <div style={{ marginTop: 12, padding: "32px 0", textAlign: "center", fontSize: 13, color: "#94a3b8", background: "#f8fafc", borderRadius: 8 }}>분석할 대화 데이터가 없습니다.</div>}
      </div>

      {report && report.totalConversations > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <MetricCard label="총 대화 수" value={fmt(report.totalConversations)} />
            <MetricCard label="답변 성공률" value={fmtPct(answeredRate)} helper={`${fmt(report.answeredCount)}건 답변`} color={answeredRate >= 70 ? "green" : answeredRate >= 50 ? "orange" : "red"} />
            <MetricCard label="Fallback 비율" value={fmtPct(report.fallbackRate)} helper={`${fmt(report.fallbackCount)}건`} color={report.fallbackRate != null && report.fallbackRate >= 30 ? "red" : "default"} />
            <MetricCard label="평균 응답시간" value={fmtLatency(report.avgLatencyMs)} />
            <MetricCard label="평균 topScore" value={fmtScore(report.avgTopScore)} color={report.avgTopScore != null && report.avgTopScore >= 0.7 ? "green" : report.avgTopScore != null && report.avgTopScore >= 0.45 ? "orange" : "red"} />
            <MetricCard label="LLM 실행률" value={fmtPct(report.llmExecutedRate)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
            <div>
              <QuestionTable title="최근 실패 질문" description="fallback·제한·충돌·이관으로 종료된 최근 질문입니다." rows={report.recentFailedQuestions} emptyText="최근 실패 질문이 없습니다." />
              <QuestionTable title="낮은 점수 질문" description="답변은 생성됐지만 retrieval topScore가 낮은 질문입니다." rows={report.lowScoreQuestions} emptyText="낮은 점수 질문이 없습니다." />
              <QuestionTable title="출처 없는 답변" description="답변은 성공했지만 citation이 저장되지 않은 항목입니다." rows={report.noCitationAnswers} emptyText="출처 없는 답변이 없습니다." />
            </div>
            <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>Fallback 원인 TOP</h3>
              </div>
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {report.topFallbackReasons.length === 0 ? (
                  <p style={{ textAlign: "center", fontSize: 13, color: "#94a3b8", padding: "24px 0" }}>fallback 데이터가 없습니다.</p>
                ) : report.topFallbackReasons.map(item => (
                  <div key={item.reason} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <p style={{ fontSize: 13, color: "#334155", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.reason}</p>
                    <span style={{ flexShrink: 0, background: "#e0e7ff", color: "#3730a3", borderRadius: 99, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{fmt(item.count)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
