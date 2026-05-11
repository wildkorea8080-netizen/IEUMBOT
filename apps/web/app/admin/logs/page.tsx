"use client";

import { useEffect, useState } from "react";
import { Download, Eye, X } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots, getAdminChatLogs, getAdminChatLogsExportUrl } from "../../../lib/api/admin-operations";
import type { AdminChatLogItem, AdminChatbotItem } from "../../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  return "요청 처리 중 오류가 발생했습니다.";
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function outcomeClass(outcome?: string | null): string {
  if (outcome === "answered") return "badge-success";
  if (outcome === "insufficient_evidence") return "badge-warning";
  if (outcome === "escalated") return "badge-info";
  if (outcome === "restricted" || outcome === "blocked") return "badge-danger";
  return "badge-neutral";
}

function outcomeLabel(outcome?: string | null): string {
  if (outcome === "answered") return "답변";
  if (outcome === "insufficient_evidence") return "근거 부족";
  if (outcome === "escalated") return "이관";
  if (outcome === "restricted" || outcome === "blocked") return "차단";
  return outcome ?? "-";
}

export default function LogsPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<AdminChatLogItem[]>([]);
  const [detail, setDetail] = useState<AdminChatLogItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(cid = chatbotId) {
    setIsLoading(true);
    setError(null);
    try {
      const [logsRes, chatbotRes] = await Promise.all([
        getAdminChatLogs({ chatbotId: cid.trim() || undefined, limit: 200 }),
        chatbots.length === 0 ? getAdminChatbots() : Promise.resolve(null),
      ]);
      setItems(logsRes.items);
      if (chatbotRes) setChatbots(chatbotRes.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* 페이지 헤더 */}
      <div className="mb-2">
        <h1 className="section-title">대화 로그</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>질문·답변·출처·실패 케이스를 시간순으로 확인하고 CSV로 내보냅니다.</p>
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <select
            value={chatbotId}
            onChange={e => { setChatbotId(e.target.value); void load(e.target.value); }}
            className="input-field"
            style={{ width: 200 }}
          >
            <option value="">전체 챗봇</option>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" onClick={() => void load()} className="btn-secondary" style={{ padding: "8px 16px" }}>
            조회
          </button>
          <button
            type="button"
            onClick={() => {
              const url = getAdminChatLogsExportUrl({ chatbotId: chatbotId.trim() || undefined, limit: 1000 });
              window.open(url, "_blank");
            }}
            className="btn-secondary"
            style={{ padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}
          >
            <Download style={{ width: 14, height: 14 }} />
            CSV 내보내기
          </button>
        </div>
        {error && (
          <p style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#dc2626" }}>
            {error}
          </p>
        )}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="table-header" style={{ width: 110 }}>시간</th>
                <th className="table-header">질문</th>
                <th className="table-header">답변 미리보기</th>
                <th className="table-header" style={{ width: 90 }}>결과</th>
                <th className="table-header" style={{ width: 60 }}>출처</th>
                <th className="table-header" style={{ width: 60 }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-cell" style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                    로그가 없습니다.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td className="table-cell" style={{ color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(item.createdAt)}</td>
                    <td className="table-cell">
                      <p style={{ color: "#1e293b", fontWeight: 500, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {item.metadataJson.question ?? "(질문 없음)"}
                      </p>
                    </td>
                    <td className="table-cell">
                      <p style={{ fontSize: 12, color: "#64748b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {item.metadataJson.answer ?? "(응답 없음)"}
                      </p>
                    </td>
                    <td className="table-cell">
                      <span className={outcomeClass(item.metadataJson.outcome)}>
                        {outcomeLabel(item.metadataJson.outcome)}
                      </span>
                    </td>
                    <td className="table-cell" style={{ color: "#475569", textAlign: "center" }}>
                      {Array.isArray(item.metadataJson.citationSummary) ? item.metadataJson.citationSummary.length : 0}
                    </td>
                    <td className="table-cell">
                      <button
                        type="button"
                        onClick={() => setDetail(item)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", padding: 4, display: "flex", alignItems: "center" }}
                        title="상세 보기"
                      >
                        <Eye style={{ width: 16, height: 16 }} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {!isLoading && items.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#94a3b8", textAlign: "right" }}>
            최근 {items.length}건 표시 중 (최대 200건)
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(15,23,42,0.3)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setDetail(null)}>
          <div
            style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, background: "white", zIndex: 1 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: 0 }}>로그 상세</h3>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{fmtDate(detail.createdAt)}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* 메타 */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className={outcomeClass(detail.metadataJson.outcome)}>{outcomeLabel(detail.metadataJson.outcome)}</span>
                <span className="badge-neutral">출처 {Array.isArray(detail.metadataJson.citationSummary) ? detail.metadataJson.citationSummary.length : 0}건</span>
              </div>

              {/* 질문 */}
              <div style={{ background: "#eff6ff", borderRadius: 10, padding: 14, border: "1px solid #bfdbfe" }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>질문</p>
                <p style={{ fontSize: 13, color: "#1e293b", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{detail.metadataJson.question ?? "-"}</p>
              </div>

              {/* 답변 */}
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>답변</p>
                <p style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{detail.metadataJson.answer ?? "-"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
