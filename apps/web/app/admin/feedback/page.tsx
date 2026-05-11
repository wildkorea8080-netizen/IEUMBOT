"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, BarChart2 } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import {
  getAdminChatbots,
  getFeedbackByDocument,
  getFeedbackSummary,
  getLowRatedMessages,
} from "../../../lib/api/admin-operations";
import type {
  DocumentFeedbackItem,
  FeedbackSummary,
  LowRatedMessageItem,
} from "../../../lib/api/admin-operations";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

const PAGE_SIZE = 20;

function errMsg(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "데이터를 불러오지 못했습니다.";
}

function fmtNum(v: number) { return v.toLocaleString("ko-KR"); }
function fmtPct(v: number) { return `${v.toFixed(1)}%`; }
function fmtDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function StatCard(props: { label: string; value: string; helper?: string; icon: React.ReactNode; color?: "green" | "red" | "blue" | "default" }) {
  const bg = props.color === "green" ? "#f0fdf4" : props.color === "red" ? "#fef2f2" : props.color === "blue" ? "#eff6ff" : "white";
  const border = props.color === "green" ? "#bbf7d0" : props.color === "red" ? "#fecaca" : props.color === "blue" ? "#bfdbfe" : "#e2e8f0";
  const iconBg = props.color === "green" ? "#dcfce7" : props.color === "red" ? "#fee2e2" : props.color === "blue" ? "#dbeafe" : "#f1f5f9";
  const iconColor = props.color === "green" ? "#16a34a" : props.color === "red" ? "#dc2626" : props.color === "blue" ? "#2563eb" : "#64748b";
  const valColor = props.color === "green" ? "#16a34a" : props.color === "red" ? "#dc2626" : "#0f172a";
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${border}`, background: bg, padding: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", color: iconColor, flexShrink: 0 }}>
        {props.icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 12, color: "#64748b" }}>{props.label}</p>
        <p style={{ fontSize: 22, fontWeight: 700, color: valColor, marginTop: 4 }}>{props.value}</p>
        {props.helper && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{props.helper}</p>}
      </div>
    </div>
  );
}

function PositiveBar({ rate }: { rate: number }) {
  const pct = Math.min(100, Math.max(0, rate));
  const barColor = pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#f87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: "#f1f5f9", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 12, color: "#475569", minWidth: 40, textAlign: "right" }}>{fmtPct(pct)}</span>
    </div>
  );
}

export default function AdminFeedbackPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [byDocument, setByDocument] = useState<DocumentFeedbackItem[]>([]);
  const [lowRated, setLowRated] = useState<LowRatedMessageItem[]>([]);
  const [lowRatedTotal, setLowRatedTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(cid: string, pageIndex: number) {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryRes, docRes, lowRes, chatbotRes] = await Promise.all([
        getFeedbackSummary(cid || undefined),
        getFeedbackByDocument(cid || undefined),
        getLowRatedMessages({ chatbotId: cid || undefined, limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE }),
        chatbots.length === 0 ? getAdminChatbots() : Promise.resolve(null),
      ]);
      setSummary(summaryRes);
      setByDocument(docRes.items);
      setLowRated(lowRes.items);
      setLowRatedTotal(lowRes.total);
      if (chatbotRes) setChatbots(chatbotRes.items);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAll(chatbotId, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbotId, page]);

  const totalPages = Math.ceil(lowRatedTotal / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* 페이지 헤더 */}
      <div className="mb-2">
        <h1 className="section-title">피드백 현황</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>사용자가 남긴 좋아요/싫어요 피드백을 기반으로 답변 품질을 분석합니다.</p>
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <select value={chatbotId} onChange={e => { setChatbotId(e.target.value); setPage(0); }} className="input-field" style={{ width: 200 }}>
            <option value="">전체 챗봇</option>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" onClick={() => { setPage(0); void loadAll(chatbotId, 0); }} disabled={isLoading}
            className="btn-secondary" style={{ padding: "8px 16px", opacity: isLoading ? 0.5 : 1 }}>
            {isLoading ? "로딩 중..." : "새로고침"}
          </button>
        </div>
        {error && (
          <p style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#dc2626" }}>
            {error}
          </p>
        )}
      </div>

      {/* 지표 카드 4개 */}
      {summary ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatCard
            label="전체 AI 메시지"
            value={fmtNum(summary.totalAssistantMessages)}
            icon={<MessageSquare style={{ width: 18, height: 18 }} />}
            color="blue"
          />
          <StatCard
            label="피드백 수신"
            value={fmtNum(summary.feedbackReceived)}
            helper={summary.totalAssistantMessages > 0
              ? `참여율 ${fmtPct((summary.feedbackReceived / summary.totalAssistantMessages) * 100)}`
              : undefined}
            icon={<BarChart2 style={{ width: 18, height: 18 }} />}
          />
          <StatCard
            label="좋아요"
            value={fmtNum(summary.thumbsUp)}
            helper={summary.feedbackReceived > 0 ? `긍정률 ${fmtPct(summary.positiveRate)}` : undefined}
            icon={<ThumbsUp style={{ width: 18, height: 18 }} />}
            color={summary.positiveRate >= 70 ? "green" : "default"}
          />
          <StatCard
            label="싫어요"
            value={fmtNum(summary.thumbsDown)}
            icon={<ThumbsDown style={{ width: 18, height: 18 }} />}
            color={summary.thumbsDown > 0 ? "red" : "default"}
          />
        </div>
      ) : isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ height: 88, borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      ) : null}

      {/* 긍정률 바 (summary 있을 때) */}
      {summary && summary.feedbackReceived > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>전체 긍정률</span>
            <span style={{ fontSize: 13, color: "#64748b" }}>{fmtNum(summary.thumbsUp)} / {fmtNum(summary.feedbackReceived)}건</span>
          </div>
          <PositiveBar rate={summary.positiveRate} />
        </div>
      )}

      {/* 문서별 피드백 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>문서별 피드백</h3>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>참조된 문서 기준으로 집계한 좋아요/싫어요와 긍정률</p>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th className="table-header">문서명</th>
              <th className="table-header" style={{ width: 72, textAlign: "right" }}>👍</th>
              <th className="table-header" style={{ width: 72, textAlign: "right" }}>👎</th>
              <th className="table-header" style={{ width: 72, textAlign: "right" }}>합계</th>
              <th className="table-header" style={{ width: 180 }}>긍정률</th>
            </tr>
          </thead>
          <tbody>
            {byDocument.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-cell" style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
                  아직 피드백 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              byDocument.map((item, i) => (
                <tr key={item.documentId ?? i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td className="table-cell">
                    <p style={{ fontWeight: 500, color: "#1e293b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{item.documentName}</p>
                  </td>
                  <td className="table-cell" style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtNum(item.thumbsUp)}</td>
                  <td className="table-cell" style={{ textAlign: "right", color: "#dc2626", fontWeight: 600 }}>{fmtNum(item.thumbsDown)}</td>
                  <td className="table-cell" style={{ textAlign: "right", color: "#475569" }}>{fmtNum(item.totalFeedback)}</td>
                  <td className="table-cell"><PositiveBar rate={item.positiveRate} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 낮은 평점 메시지 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>싫어요 메시지</h3>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>싫어요를 받은 메시지 목록입니다.</p>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th className="table-header">질문</th>
              <th className="table-header" style={{ width: 260 }}>답변 (앞 100자)</th>
              <th className="table-header" style={{ width: 120 }}>피드백 일시</th>
            </tr>
          </thead>
          <tbody>
            {lowRated.length === 0 ? (
              <tr>
                <td colSpan={3} className="table-cell" style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
                  싫어요 피드백이 없습니다.
                </td>
              </tr>
            ) : (
              lowRated.map(item => (
                <tr key={item.messageId} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  onClick={() => { window.location.href = `/admin/chat-logs?messageId=${item.messageId}`; }}>
                  <td className="table-cell">
                    <p style={{ color: "#1e293b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.normalizedQuery || "-"}</p>
                  </td>
                  <td className="table-cell">
                    <p style={{ fontSize: 12, color: "#64748b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {item.content.slice(0, 100)}{item.content.length > 100 ? "..." : ""}
                    </p>
                  </td>
                  <td className="table-cell" style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{fmtDate(item.feedbackAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid #f1f5f9", fontSize: 13, color: "#64748b" }}>
            <span>{lowRatedTotal.toLocaleString("ko-KR")}건 중 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, lowRatedTotal)}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="btn-secondary" style={{ padding: "5px 14px", fontSize: 12, opacity: page === 0 ? 0.4 : 1 }}>
                이전
              </button>
              <span style={{ padding: "5px 8px" }}>{page + 1} / {totalPages}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="btn-secondary" style={{ padding: "5px 14px", fontSize: 12, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                다음
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
