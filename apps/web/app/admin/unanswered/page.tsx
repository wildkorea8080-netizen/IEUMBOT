"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle, EyeOff, Plus } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { createFaqItem, getAdminChatbots, getUnansweredLogs, patchUnansweredLog } from "../../../lib/api/admin-operations";
import type { UnansweredLogItem } from "../../../lib/api/admin-operations";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

function errMsg(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "요청 처리 중 오류가 발생했습니다.";
}

function scoreColor(score: number | null): string {
  if (score === null) return "#94a3b8";
  if (score < 0.2) return "#dc2626";
  if (score < 0.3) return "#d97706";
  return "#64748b";
}

function statusBadge(status: string): string {
  if (status === "resolved") return "badge-success";
  if (status === "ignored") return "badge-neutral";
  return "badge-warning";
}

function statusLabel(status: string): string {
  if (status === "resolved") return "해결됨";
  if (status === "ignored") return "무시";
  return "미처리";
}

function outcomeLabel(outcome: string): string {
  if (outcome === "escalate") return "이관";
  if (outcome === "insufficient_evidence") return "근거 부족";
  return outcome;
}

function fmtDate(v: string): string {
  return new Date(v).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function UnansweredPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [items, setItems] = useState<UnansweredLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [chatbotId, setChatbotId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [faqModal, setFaqModal] = useState<UnansweredLogItem | null>(null);
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqSaving, setFaqSaving] = useState(false);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function load(p = page) {
    setIsLoading(true);
    setError(null);
    try {
      const [res, chatbotRes] = await Promise.all([
        getUnansweredLogs({ chatbotId: chatbotId || undefined, status: status || undefined, from: from || undefined, to: to || undefined, page: p, pageSize: PAGE_SIZE }),
        chatbots.length === 0 ? getAdminChatbots() : Promise.resolve(null),
      ]);
      setItems(res.items);
      setTotal(res.total);
      setPage(res.page);
      if (chatbotRes) setChatbots(chatbotRes.items);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function saveFaqFromUnanswered() {
    if (!faqModal || !faqAnswer.trim()) return;
    setFaqSaving(true);
    setError(null);
    try {
      await createFaqItem({ chatbotId: faqModal.chatbotId, question: faqModal.question, answer: faqAnswer.trim() });
      const updated = await patchUnansweredLog(faqModal.id, "resolved");
      setItems(prev => prev.map(i => (i.id === faqModal.id ? updated : i)));
      setFaqModal(null);
      setFaqAnswer("");
      setToast("FAQ로 등록하고 해결 처리했습니다.");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setFaqSaving(false);
    }
  }

  async function act(id: string, newStatus: "resolved" | "ignored") {
    setActingId(id);
    try {
      const updated = await patchUnansweredLog(id, newStatus);
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      setToast(newStatus === "resolved" ? "해결 처리되었습니다." : "무시 처리되었습니다.");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* 토스트 */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 9999, padding: "12px 20px", borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {toast}
        </div>
      )}

      {/* FAQ 등록 모달 (오답 → 지식화 → 자동 해결) */}
      {faqModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => { if (!faqSaving) setFaqModal(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 6 }}>FAQ로 등록</h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 18 }}>이 질문의 답변을 등록하면 다음부터 같은 질문에 자동 응답합니다. 등록 시 해당 미답변은 해결 처리됩니다.</p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>질문</label>
              <div style={{ padding: "9px 12px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{faqModal.question}</div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>답변</label>
              <textarea value={faqAnswer} onChange={e => setFaqAnswer(e.target.value)} rows={5} autoFocus
                placeholder="이 질문에 대한 정확한 답변을 입력하세요."
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", outline: "none", resize: "vertical", lineHeight: 1.7 }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => { if (!faqSaving) setFaqModal(null); }}
                style={{ flex: 1, padding: "11px 0", border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", fontSize: 14, fontWeight: 500, color: "#374151", cursor: "pointer" }}>취소</button>
              <button type="button" onClick={() => void saveFaqFromUnanswered()} disabled={faqSaving || !faqAnswer.trim()}
                style={{ flex: 1, padding: "11px 0", border: "none", borderRadius: 10, background: (faqSaving || !faqAnswer.trim()) ? "#9ca3af" : "#7c3aed", fontSize: 14, fontWeight: 600, color: "#fff", cursor: (faqSaving || !faqAnswer.trim()) ? "not-allowed" : "pointer" }}>
                {faqSaving ? "등록 중..." : "FAQ 등록 + 해결"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-2">
        <h1 className="section-title">미답변 질문 관리</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
          RAG 검색 실패 또는 낮은 신뢰도로 처리된 질문을 확인하고 지식을 보완합니다.
        </p>
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} className="input-field" style={{ width: 180 }}>
            <option value="">전체 챗봇</option>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="input-field" style={{ width: 130 }}>
            <option value="">전체 상태</option>
            <option value="pending">미처리</option>
            <option value="resolved">해결됨</option>
            <option value="ignored">무시</option>
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-field" style={{ width: 148 }} aria-label="시작일" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-field" style={{ width: 148 }} aria-label="종료일" />
          <button type="button" onClick={() => void load(1)} className="btn-primary" style={{ padding: "8px 20px" }}>검색</button>
        </div>
        {error && <p style={{ marginTop: 10, fontSize: 13, color: "#dc2626" }}>{error}</p>}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {isLoading ? "불러오는 중..." : `총 ${total.toLocaleString("ko-KR")}건`}
          </span>
        </div>

        {!isLoading && items.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            미답변 질문이 없습니다.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="table-header">질문 내용</th>
                <th className="table-header" style={{ width: 80 }}>점수</th>
                <th className="table-header" style={{ width: 90 }}>결과</th>
                <th className="table-header" style={{ width: 120 }}>발생 일시</th>
                <th className="table-header" style={{ width: 80 }}>상태</th>
                <th className="table-header" style={{ width: 180 }}>처리</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td className="table-cell">
                    <p style={{ color: "#1e293b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {item.question}
                    </p>
                  </td>
                  <td className="table-cell" style={{ color: scoreColor(item.searchScore), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {item.searchScore !== null ? item.searchScore.toFixed(3) : "-"}
                  </td>
                  <td className="table-cell">
                    <span className="badge-neutral" style={{ fontSize: 11 }}>{outcomeLabel(item.outcome)}</span>
                  </td>
                  <td className="table-cell" style={{ color: "#94a3b8", fontSize: 12, whiteSpace: "nowrap" }}>
                    {fmtDate(item.createdAt)}
                  </td>
                  <td className="table-cell">
                    <span className={statusBadge(item.status)}>{statusLabel(item.status)}</span>
                  </td>
                  <td className="table-cell">
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {item.status !== "resolved" && (
                        <button
                          type="button"
                          disabled={actingId === item.id}
                          onClick={() => void act(item.id, "resolved")}
                          style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", cursor: "pointer", opacity: actingId === item.id ? 0.5 : 1 }}
                        >
                          <CheckCircle style={{ width: 11, height: 11 }} />해결됨
                        </button>
                      )}
                      {item.status === "pending" && (
                        <button
                          type="button"
                          disabled={actingId === item.id}
                          onClick={() => void act(item.id, "ignored")}
                          style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", cursor: "pointer", opacity: actingId === item.id ? 0.5 : 1 }}
                        >
                          <EyeOff style={{ width: 11, height: 11 }} />무시
                        </button>
                      )}
                      {item.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={() => { setFaqModal(item); setFaqAnswer(""); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #ddd6fe", background: "#f5f3ff", color: "#7c3aed", cursor: "pointer" }}
                        >
                          <Plus style={{ width: 11, height: 11 }} />FAQ 등록
                        </button>
                      )}
                      <Link
                        href={`/admin/knowledge/register?q=${encodeURIComponent(item.question)}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", textDecoration: "none" }}
                      >
                        <Plus style={{ width: 11, height: 11 }} />지식 추가
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 페이지네이션 */}
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
