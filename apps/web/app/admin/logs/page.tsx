"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots, getAdminChatLogs, getAdminChatLogsExportUrl } from "../../../lib/api/admin-operations";
import type { AdminChatLogItem, AdminChatbotItem } from "../../../lib/api/admin-operations-types";

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  return "요청 처리 중 오류가 발생했습니다.";
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function questionType(outcome?: string | null) {
  if (outcome === "answered") return "일반 문의";
  if (outcome === "insufficient_evidence") return "근거 부족";
  if (outcome === "restricted" || outcome === "blocked") return "정책 제한";
  if (outcome === "escalated") return "이관";
  return "기타 문의";
}

function citationLabel(citations: unknown[] | undefined) {
  if (!Array.isArray(citations) || citations.length === 0) return "참조 지식 없음";
  return `참조 지식 ${citations.length}건`;
}

function citationName(c: Record<string, unknown>) {
  return (
    (c.documentName as string) ||
    (c.title as string) ||
    (c.sourceTitle as string) ||
    (c.fileName as string) ||
    (typeof c.sourceUrl === "string" ? c.sourceUrl : "") ||
    "(제목 없음)"
  );
}

function latencyLabel(meta: Record<string, unknown>) {
  const ms = meta.latencyMs ?? meta.latency_ms;
  if (typeof ms === "number") return `${(ms / 1000).toFixed(2)}초`;
  return "-";
}

type DateRange = "today" | "week" | "month" | "custom";

const PAGE_SIZE = 20;

// ── 통계 계산 ─────────────────────────────────────────────────────────────────

function calcStats(items: AdminChatLogItem[]) {
  if (items.length === 0) return { users: 0, total: 0, successRate: 0, avgLatency: null, thumbsUp: 0, thumbsDown: 0 };
  const answered = items.filter(i => i.metadataJson.outcome === "answered").length;
  const meta = items.map(i => i.metadataJson as Record<string, unknown>);
  const latencies = meta.map(m => Number(m.latencyMs ?? m.latency_ms)).filter(n => n > 0);
  const avgMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
  return {
    users: items.length, // session 단위로 표시
    total: items.length,
    successRate: Math.round((answered / items.length) * 1000) / 10,
    avgLatency: avgMs ? (avgMs / 1000).toFixed(1) : null,
    thumbsUp: 0, thumbsDown: 0,
  };
}

// ── 상세 모달 ─────────────────────────────────────────────────────────────────

function DetailModal({ item, onClose }: { item: AdminChatLogItem; onClose: () => void }) {
  const meta = item.metadataJson as Record<string, unknown>;
  const question = String(meta.question ?? "");
  const answer = String(meta.answer ?? "");
  const citations = Array.isArray(meta.citationSummary)
    ? (meta.citationSummary.filter(c => c && typeof c === "object") as Record<string, unknown>[])
    : [];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}
        onClick={e => e.stopPropagation()}>

        {/* 모달 헤더 */}
        <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 4 }}>대화상세</h2>
              <p style={{ fontSize: 13, color: "#9ca3af" }}>사용자: {shortId(item.id)} (대화 1건)</p>
            </div>
            <span style={{ fontSize: 13, color: "#9ca3af" }}>{fmtFull(item.createdAt)}</span>
          </div>
        </div>

        {/* 채팅 영역 */}
        <div style={{ padding: "20px 28px", minHeight: 200 }}>
          {/* 사용자 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginBottom: 20 }}>
            <div style={{ background: "#ef4444", color: "#fff", borderRadius: "20px 20px 4px 20px", padding: "10px 18px", fontSize: 14, maxWidth: "70%", lineHeight: 1.6 }}>
              {question || "(질문 없음)"}
            </div>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtTime(item.createdAt)}</span>
          </div>

          {/* AI 답변 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: "#111827", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {answer || "(응답 없음)"}
            </div>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtTime(item.createdAt)}</span>
          </div>

          {/* 참조 지식 (출처) — 답변이 어떤 문서/섹션을 근거로 했는지 */}
          {citations.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                참조 지식 ({citations.length}건)
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                {citations.map((c, i) => {
                  const name = citationName(c);
                  const section = c.sectionTitle ? String(c.sectionTitle) : "";
                  const page = c.pageNumber != null ? `p.${c.pageNumber}` : "";
                  const url = typeof c.sourceUrl === "string" ? c.sourceUrl : "";
                  const category = typeof c.category === "string" ? c.category : "";
                  const score = typeof c.score === "number" ? c.score : null;
                  const sub = [section, page].filter(Boolean).join(" · ");
                  return (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: i < citations.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "2px 7px", height: "fit-content" }}>{i + 1}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, color: "#111827", fontWeight: 500, wordBreak: "break-word" }}>{name}</span>
                          {category && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#7c3aed", background: "#f5f3ff", borderRadius: 6, padding: "1px 7px" }}>{category}</span>}
                          {score != null && <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#2563eb", background: "#eff6ff", borderRadius: 6, padding: "1px 7px" }}>점수 {score.toFixed(3)}</span>}
                        </div>
                        {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
                        {url && (
                          <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb", wordBreak: "break-all" }}>{url}</a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 피드백 */}
          <div style={{ display: "flex", gap: 12, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
            <span style={{ fontSize: 20, color: "#9ca3af" }}>👍</span>
            <span style={{ fontSize: 20, color: "#9ca3af" }}>👎</span>
          </div>
        </div>

        {/* 닫기 */}
        <div style={{ padding: "12px 28px 24px", display: "flex", justifyContent: "center" }}>
          <button type="button" onClick={onClose}
            style={{ padding: "11px 48px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", fontSize: 14, color: "#374151", cursor: "pointer", fontWeight: 500 }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<AdminChatLogItem[]>([]);
  const [detail, setDetail] = useState<AdminChatLogItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 필터 상태
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [questionTypeFilter, setQuestionTypeFilter] = useState("");
  const [outcomeFilter] = useState("");
  const [citationFilter, setCitationFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  async function load(cid = chatbotId) {
    setIsLoading(true); setError(null);
    try {
      const [logsRes, chatbotRes] = await Promise.all([
        getAdminChatLogs({ chatbotId: cid.trim() || undefined, limit: 500 }),
        chatbots.length === 0 ? getAdminChatbots() : Promise.resolve(null),
      ]);
      setItems(logsRes.items);
      if (chatbotRes) {
        setChatbots(chatbotRes.items);
        if (!cid && chatbotRes.items[0]) setChatbotId(chatbotRes.items[0].id);
      }
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 날짜 필터 적용
  const filteredItems = useMemo(() => {
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (dateRange === "today") { from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
    else if (dateRange === "week") { from = new Date(now.getTime() - 7 * 86400_000); }
    else if (dateRange === "month") { from = new Date(now.getTime() - 30 * 86400_000); }
    else if (dateRange === "custom" && customFrom) { from = new Date(customFrom); to = customTo ? new Date(customTo) : null; }

    return items.filter(item => {
      const d = new Date(item.createdAt);
      if (from && d < from) return false;
      if (to && d > to) return false;
      const meta = item.metadataJson as Record<string, unknown>;
      const qType = questionType(item.metadataJson.outcome);
      if (questionTypeFilter && qType !== questionTypeFilter) return false;
      if (outcomeFilter && item.metadataJson.outcome !== outcomeFilter) return false;
      if (citationFilter === "with" && (!Array.isArray(meta.citationSummary) || meta.citationSummary.length === 0)) return false;
      if (citationFilter === "without" && Array.isArray(meta.citationSummary) && meta.citationSummary.length > 0) return false;
      if (searchQuery) {
        const q = String(meta.question ?? "").toLowerCase();
        const a = String(meta.answer ?? "").toLowerCase();
        if (!q.includes(searchQuery.toLowerCase()) && !a.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, dateRange, customFrom, customTo, questionTypeFilter, outcomeFilter, citationFilter, searchQuery]);

  const stats = useMemo(() => calcStats(filteredItems), [filteredItems]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const questionTypes = ["일반 문의", "기타 문의", "근거 부족", "정책 제한", "이관"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── 필터 바 ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "14px 20px" }}>
        {/* 날짜 + 드롭다운 필터 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {/* 날짜 버튼 */}
          {(["today", "week", "month", "custom"] as DateRange[]).map(range => {
            const labels = { today: "오늘", week: "1주일", month: "1개월", custom: "기간선택" };
            return (
              <button key={range} type="button" onClick={() => { setDateRange(range); setPage(1); }}
                style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer",
                  border: `1.5px solid ${dateRange === range ? "#111827" : "#e5e7eb"}`,
                  background: dateRange === range ? "#111827" : "#fff",
                  color: dateRange === range ? "#fff" : "#374151",
                }}>
                {labels[range]}
              </button>
            );
          })}
          <div style={{ width: 1, background: "#e5e7eb", margin: "0 4px" }} />
          {/* 질문 유형 */}
          <select value={questionTypeFilter} onChange={e => { setQuestionTypeFilter(e.target.value); setPage(1); }}
            style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}>
            <option value="">질문 유형</option>
            {questionTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* 전체 대화 (챗봇) */}
          <select value={chatbotId} onChange={e => { setChatbotId(e.target.value); void load(e.target.value); setPage(1); }}
            style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}>
            <option value="">전체 대화</option>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {/* 응답 정보 */}
          <select value={citationFilter} onChange={e => { setCitationFilter(e.target.value); setPage(1); }}
            style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}>
            <option value="">응답 정보</option>
            <option value="with">참조 지식 있음</option>
            <option value="without">참조 지식 없음</option>
          </select>
        </div>

        {/* 기간선택 커스텀 */}
        {dateRange === "custom" && (
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
            onKeyDown={e => { if (e.key === "Enter") setPage(1); }}
            placeholder="대화 내용으로 검색하세요."
            style={{ flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, outline: "none", color: "#374151" }}
          />
          <button type="button" onClick={() => setPage(1)}
            style={{ padding: "10px 20px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", fontSize: 13, fontWeight: 500, color: "#374151", cursor: "pointer" }}>
            검색
          </button>
        </div>
        {error && <p style={{ marginTop: 10, fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</p>}
      </div>

      {/* ── 통계 ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0 }}>
          {[
            { label: "총 사용자 수", value: `${stats.users}명`, sub: "비교 데이터가 없습니다." },
            { label: "총 대화 수", value: `${stats.total}건`, sub: "비교 데이터가 없습니다." },
            { label: "답변 성공률", value: stats.total ? `${stats.successRate.toFixed(1)} %` : "-", sub: "비교 데이터가 없습니다." },
            { label: "평균 응답시간(초)", value: stats.avgLatency ? `${stats.avgLatency} 초` : "-", sub: "비교 데이터가 없습니다." },
            { label: "만족도", value: "-", sub: null, extra: <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 13, color: "#9ca3af" }}><span>👍 {stats.thumbsUp}</span><span>👎 {stats.thumbsDown}</span></div> },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "0 24px", borderRight: i < 4 ? "1px solid #f1f5f9" : "none" }}>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 12, color: "#d1d5db", marginTop: 4 }}>{s.sub}</div>}
              {s.extra}
            </div>
          ))}
        </div>
      </div>

      {/* ── 대화 로그 ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>대화 로그</h2>
          <button type="button"
            onClick={() => { const url = getAdminChatLogsExportUrl({ chatbotId: chatbotId.trim() || undefined, limit: 1000 }); window.open(url, "_blank"); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, color: "#374151", cursor: "pointer" }}>
            <Download style={{ width: 13, height: 13 }} />CSV 내보내기
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {["시간", "질문 유형", "내용 미리보기", "응답 정보", "응답 시간", "만족도"].map(col => (
                  <th key={col} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280", background: "#f9fafb" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedItems.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "40px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>로그가 없습니다.</td></tr>
              ) : pagedItems.map(item => {
                const meta = item.metadataJson as Record<string, unknown>;
                const question = String(meta.question ?? "");
                const answer = String(meta.answer ?? "");
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                    onClick={() => setDetail(item)}>
                    <td style={{ padding: "14px 16px", color: "#9ca3af", fontSize: 12, whiteSpace: "nowrap" }}>
                      {new Date(item.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/\./g, "-").replace(/ /g, " ")}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: 12, background: "#f1f5f9", color: "#475569", borderRadius: 4, padding: "2px 8px", fontWeight: 500 }}>
                        {questionType(item.metadataJson.outcome)}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", maxWidth: 400 }}>
                      <div style={{ fontWeight: 600, color: "#111827", fontSize: 13, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {question || "(질문 없음)"}
                      </div>
                      <div style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {answer || "(응답 없음)"}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                      {citationLabel(item.metadataJson.citationSummary)}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                      {latencyLabel(meta)}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: "#9ca3af" }}>-</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* 푸터: 총 건수 + 페이지네이션 */}
        {!isLoading && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#9ca3af" }}>총 {filteredItems.length}건</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 13, color: page === 1 ? "#d1d5db" : "#374151", cursor: page === 1 ? "not-allowed" : "pointer" }}>
                이전
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <button key={p} type="button" onClick={() => setPage(p)}
                    style={{
                      width: 32, height: 32, border: `1.5px solid ${p === page ? "#111827" : "#e5e7eb"}`,
                      borderRadius: 6, background: p === page ? "#111827" : "#fff",
                      fontSize: 13, color: p === page ? "#fff" : "#374151", cursor: "pointer",
                    }}>{p}</button>
                );
              })}
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 13, color: page === totalPages ? "#d1d5db" : "#374151", cursor: page === totalPages ? "not-allowed" : "pointer" }}>
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {detail && <DetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
