"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { ApiClientError } from "../../lib/api";
import {
  getAdminConversationDetail,
  getAdminConversations,
  patchAdminConversation,
} from "../../lib/api/conversations";
import type {
  AdminConversationDetail,
  AdminConversationItem,
} from "../../lib/api/conversations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "대화 정보를 처리하지 못했습니다.";
}

function statusBadgeClass(status: string): string {
  if (status === "answered") return "badge-success";
  if (status === "insufficient_evidence") return "badge-warning";
  if (status === "escalated") return "badge-info";
  if (status === "blocked") return "badge-danger";
  return "badge-neutral";
}

function sourceLabel(item: AdminConversationItem): string {
  if (!item.hasCitations) return "-";
  return `${item.citationCount}건`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function formatLatency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value.toLocaleString("ko-KR")}ms`;
}

export function ConversationsManagement() {
  const [items, setItems] = useState<AdminConversationItem[]>([]);
  const [detail, setDetail] = useState<AdminConversationDetail | null>(null);
  const [memo, setMemo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [question, setQuestion] = useState("");
  const [answerStatus, setAnswerStatus] = useState("");
  const [escalated, setEscalated] = useState("");
  const [hasCitations, setHasCitations] = useState("");
  const [llmExecuted, setLlmExecuted] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  async function loadConversations(nextPage = page) {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAdminConversations({
        from: from || undefined,
        to: to || undefined,
        question: question.trim() || undefined,
        answerStatus: answerStatus || undefined,
        escalated: escalated === "" ? undefined : escalated === "true",
        hasCitations: hasCitations === "" ? undefined : hasCitations === "true",
        llmExecuted: llmExecuted === "" ? undefined : llmExecuted === "true",
        page: nextPage,
        pageSize,
      });
      setItems(response.items);
      setTotalCount(response.totalCount);
      setPage(response.page);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadConversations(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openDetail(sessionId: string) {
    setIsDetailLoading(true);
    setError(null);
    try {
      const response = await getAdminConversationDetail(sessionId);
      setDetail(response);
      setMemo(response.memo ?? "");
    } catch (detailError) {
      setError(getErrorMessage(detailError));
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function saveMemo() {
    if (!detail) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await patchAdminConversation(detail.sessionId, { memo });
      setDetail(response);
      await loadConversations(page);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 페이지 헤더 */}
      <div className="mb-2">
        <h1 className="section-title">대화 관리</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>상태·출처·에스컬레이션·응답시간 기준으로 일일 대화 이력을 확인합니다.</p>
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="input-field" style={{ width: 148 }} aria-label="시작일" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="input-field" style={{ width: 148 }} aria-label="종료일" />
          <select value={answerStatus} onChange={e => setAnswerStatus(e.target.value)}
            className="input-field" style={{ width: 148 }}>
            <option value="">전체 답변 상태</option>
            <option value="answered">답변 완료</option>
            <option value="insufficient_evidence">근거 부족</option>
            <option value="escalate">에스컬레이션</option>
            <option value="restricted">차단</option>
          </select>
          <select value={escalated} onChange={e => setEscalated(e.target.value)}
            className="input-field" style={{ width: 148 }}>
            <option value="">에스컬레이션 전체</option>
            <option value="true">에스컬레이션됨</option>
            <option value="false">에스컬레이션 없음</option>
          </select>
          <select value={hasCitations} onChange={e => setHasCitations(e.target.value)}
            className="input-field" style={{ width: 128 }}>
            <option value="">출처 전체</option>
            <option value="true">출처 있음</option>
            <option value="false">출처 없음</option>
          </select>
          <select value={llmExecuted} onChange={e => setLlmExecuted(e.target.value)}
            className="input-field" style={{ width: 128 }}>
            <option value="">LLM 전체</option>
            <option value="true">LLM 실행</option>
            <option value="false">LLM 건너뜀</option>
          </select>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#94a3b8", pointerEvents: "none" }} />
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void loadConversations(1); }}
              placeholder="질문 검색..."
              className="input-field"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <button type="button" onClick={() => void loadConversations(1)} className="btn-primary" style={{ padding: "8px 20px" }}>
            검색
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
                <th className="table-header" style={{ width: 120 }}>시간</th>
                <th className="table-header">질문 미리보기</th>
                <th className="table-header" style={{ width: 110 }}>답변 상태</th>
                <th className="table-header" style={{ width: 72 }}>출처</th>
                <th className="table-header" style={{ width: 90 }}>에스컬레이션</th>
                <th className="table-header" style={{ width: 90 }}>응답시간</th>
                <th className="table-header" style={{ width: 80 }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell" style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                    대화 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.sessionId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td className="table-cell" style={{ color: "#64748b", whiteSpace: "nowrap" }}>{formatDateTime(item.time)}</td>
                    <td className="table-cell">
                      <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: "#1e293b" }}>
                        {item.questionPreview ?? "-"}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={statusBadgeClass(item.answerStatus)}>{item.answerStatusLabel}</span>
                    </td>
                    <td className="table-cell" style={{ color: "#475569" }}>{sourceLabel(item)}</td>
                    <td className="table-cell" style={{ color: "#475569" }}>{item.escalated ? "예" : "-"}</td>
                    <td className="table-cell" style={{ color: "#475569", fontVariantNumeric: "tabular-nums" }}>{formatLatency(item.responseTimeMs)}</td>
                    <td className="table-cell">
                      <button type="button" onClick={() => void openDetail(item.sessionId)} className="btn-secondary" style={{ padding: "4px 12px", fontSize: 12 }}>
                        보기
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* 페이지네이션 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #f1f5f9", fontSize: 13, color: "#64748b" }}>
          <span>총 {totalCount.toLocaleString("ko-KR")}건 — {page} / {totalPages} 페이지</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={page <= 1} onClick={() => void loadConversations(page - 1)}
              className="btn-secondary" style={{ padding: "5px 14px", fontSize: 12, opacity: page <= 1 ? 0.4 : 1 }}>
              이전
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => void loadConversations(page + 1)}
              className="btn-secondary" style={{ padding: "5px 14px", fontSize: 12, opacity: page >= totalPages ? 0.4 : 1 }}>
              다음
            </button>
          </div>
        </div>
      </div>

      {/* 상세 슬라이드 패널 */}
      {(detail || isDetailLoading) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(15,23,42,0.3)" }} onClick={() => setDetail(null)}>
          <div
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "100%", maxWidth: 600, background: "white", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 패널 헤더 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, background: "white", zIndex: 1 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: 0 }}>대화 상세</h3>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>운영자 전용 필드</p>
              </div>
              <button type="button" onClick={() => setDetail(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {isDetailLoading && (
              <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>상세 정보를 불러오는 중...</div>
            )}

            {detail && (
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                {/* 메타 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13 }}>
                  <div><span style={{ color: "#64748b" }}>답변 상태 </span><strong style={{ color: "#1e293b" }}>{detail.answerStatusLabel}</strong></div>
                  <div><span style={{ color: "#64748b" }}>응답시간 </span><strong style={{ color: "#1e293b" }}>{formatLatency(detail.responseTimeMs)}</strong></div>
                  <div><span style={{ color: "#64748b" }}>생성일 </span><strong style={{ color: "#1e293b" }}>{formatDateTime(detail.createdAt)}</strong></div>
                  <div><span style={{ color: "#64748b" }}>세션 상태 </span><strong style={{ color: "#1e293b" }}>{detail.sessionStatus}</strong></div>
                  <div><span style={{ color: "#64748b" }}>출처 </span><strong style={{ color: "#1e293b" }}>{detail.hasCitations ? `${detail.citationSummary.length}건` : "없음"}</strong></div>
                  <div><span style={{ color: "#64748b" }}>LLM </span><strong style={{ color: "#1e293b" }}>{detail.llmExecuted ? "실행됨" : "건너뜀"}</strong></div>
                </div>

                {/* 질문 */}
                <div style={{ background: "#eff6ff", borderRadius: 10, padding: 14, border: "1px solid #bfdbfe" }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>사용자 질문</p>
                  <p style={{ fontSize: 14, color: "#1e293b", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{detail.userQuestion ?? "-"}</p>
                </div>

                {/* 답변 */}
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>AI 답변</p>
                  <p style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{detail.assistantAnswer ?? "-"}</p>
                </div>

                {/* 참조 근거 (문서·조문·페이지 + 유사도 점수 + 원문 링크) */}
                {detail.citationSummary.length > 0 && (
                  <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600, color: "#475569" }}>참조 근거 ({detail.citationSummary.length}건)</div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {detail.citationSummary.map((c, i) => (
                        <div key={i} style={{ padding: "9px 14px", borderBottom: i < detail.citationSummary.length - 1 ? "1px solid #f1f5f9" : "none", fontSize: 12, color: "#334155" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600 }}>{c.title ?? c.sourceUrl ?? "출처"}</span>
                            {c.category ? <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed", background: "#f5f3ff", borderRadius: 6, padding: "1px 7px" }}>{c.category}</span> : null}
                            {c.sectionTitle ? <span style={{ color: "#64748b" }}>/ {c.sectionTitle}</span> : null}
                            {c.pageNumber != null ? <span style={{ color: "#64748b" }}>/ p.{c.pageNumber}</span> : null}
                            {typeof c.score === "number" ? (
                              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#2563eb", background: "#eff6ff", borderRadius: 6, padding: "1px 7px" }}>
                                점수 {c.score.toFixed(3)}
                              </span>
                            ) : null}
                          </div>
                          {c.sourceUrl ? (
                            <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 3, fontSize: 11, color: "#2563eb", wordBreak: "break-all" }}>
                              {c.sourceUrl}
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 사용된 프롬프트 (감사·검증용) */}
                {detail.promptTrace && (detail.promptTrace.systemPrompt || detail.promptTrace.userPrompt) && (
                  <details style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <summary style={{ padding: "10px 14px", background: "#f8fafc", fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
                      사용된 프롬프트 (감사용)
                    </summary>
                    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                      {detail.promptTrace.systemPrompt ? (
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>SYSTEM</p>
                          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11.5, lineHeight: 1.6, color: "#334155", background: "#f8fafc", borderRadius: 8, padding: 10, maxHeight: 240, overflow: "auto" }}>{detail.promptTrace.systemPrompt}</pre>
                        </div>
                      ) : null}
                      {detail.promptTrace.userPrompt ? (
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>USER (근거 포함)</p>
                          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11.5, lineHeight: 1.6, color: "#334155", background: "#f8fafc", borderRadius: 8, padding: 10, maxHeight: 320, overflow: "auto" }}>{detail.promptTrace.userPrompt}</pre>
                        </div>
                      ) : null}
                    </div>
                  </details>
                )}

                {/* 에스컬레이션 */}
                {(detail.escalationReason || detail.escalationTargetDepartment) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 14, background: "#fefce8", borderRadius: 10, border: "1px solid #fde68a", fontSize: 13 }}>
                    <div><span style={{ color: "#92400e" }}>사유 </span><span style={{ color: "#1e293b" }}>{detail.escalationReason ?? "-"}</span></div>
                    <div><span style={{ color: "#92400e" }}>부서 </span><span style={{ color: "#1e293b" }}>{detail.escalationTargetDepartment ?? "-"}</span></div>
                  </div>
                )}

                {/* 운영 메모 */}
                <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>운영 메모</p>
                  <textarea
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                    rows={3}
                    className="input-field"
                    placeholder="메모를 입력하세요"
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={() => void saveMemo()} disabled={isSaving}
                      className="btn-primary" style={{ padding: "7px 20px", fontSize: 13, opacity: isSaving ? 0.6 : 1 }}>
                      {isSaving ? "저장 중..." : "저장"}
                    </button>
                    <Link href={detail.advancedAnalysisUrl ?? "/admin/conversation-analysis"}
                      className="btn-secondary" style={{ padding: "7px 16px", fontSize: 13 }}>
                      고급 분석
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
