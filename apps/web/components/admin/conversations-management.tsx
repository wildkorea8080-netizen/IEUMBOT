"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../ui/page-panel";
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
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "대화 정보를 처리하지 못했습니다.";
}

function statusBadgeClass(status: string): string {
  if (status === "answered") return "bg-emerald-100 text-emerald-700";
  if (status === "insufficient_evidence") return "bg-amber-100 text-amber-700";
  if (status === "escalated") return "bg-blue-100 text-blue-700";
  if (status === "blocked") return "bg-rose-100 text-rose-700";
  return "bg-slate-200 text-slate-700";
}

function sourceLabel(item: AdminConversationItem): string {
  if (!item.hasCitations) return "없음";
  return `${item.citationCount}건`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function formatLatency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value}ms`;
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

  useEffect(() => {
    void loadConversations(1);
  }, []);

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
    <div className="space-y-6">
      <PagePanel
        title="대화 관리"
        description="상태, 출처, 에스컬레이션, 응답 시간 기준으로 일일 대화 이력을 확인합니다."
      >
        <div className="grid gap-3 lg:grid-cols-[160px_160px_170px_170px_170px_170px_1fr_auto]">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={answerStatus} onChange={(event) => setAnswerStatus(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">전체 답변 상태</option>
            <option value="answered">답변 완료</option>
            <option value="insufficient_evidence">근거 부족</option>
            <option value="escalate">에스컬레이션</option>
            <option value="restricted">차단</option>
            <option value="conflict">차단</option>
          </select>
          <select value={escalated} onChange={(event) => setEscalated(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">전체 에스컬레이션</option>
            <option value="true">에스컬레이션됨</option>
            <option value="false">에스컬레이션 안 됨</option>
          </select>
          <select value={hasCitations} onChange={(event) => setHasCitations(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">전체 출처 상태</option>
            <option value="true">출처 있음</option>
            <option value="false">출처 없음</option>
          </select>
          <select value={llmExecuted} onChange={(event) => setLlmExecuted(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">전체 LLM 상태</option>
            <option value="true">LLM 실행</option>
            <option value="false">LLM 건너뜀</option>
          </select>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="질문 검색"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => void loadConversations(1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            검색
          </button>
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {isLoading ? <p className="mt-4 text-sm text-slate-500">대화 목록을 불러오는 중...</p> : null}

        {!isLoading ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="w-44 px-3 py-3">시간</th>
                  <th className="px-3 py-3">질문 미리보기</th>
                  <th className="w-28 px-3 py-3">답변 상태</th>
                  <th className="w-24 px-3 py-3">출처</th>
                  <th className="w-24 px-3 py-3">에스컬레이션</th>
                  <th className="w-28 px-3 py-3">지연 시간</th>
                  <th className="w-44 px-3 py-3">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">
                      대화가 없습니다.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.sessionId}>
                      <td className="px-3 py-4 text-slate-500">{formatDateTime(item.time)}</td>
                      <td className="px-3 py-4">
                        <p className="line-clamp-2 text-slate-900">{item.questionPreview ?? "-"}</p>
                      </td>
                      <td className="px-3 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(item.answerStatus)}`}>
                          {item.answerStatusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-slate-700">{sourceLabel(item)}</td>
                      <td className="px-3 py-4 text-slate-700">{item.escalated ? "예" : "-"}</td>
                      <td className="px-3 py-4 text-slate-700">{formatLatency(item.responseTimeMs)}</td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void openDetail(item.sessionId)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700">
                            상세
                          </button>
                          <Link href="/admin/conversation-analysis" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700">
                            고급 분석
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            총 {totalCount}건 / {page}페이지 / {totalPages}페이지
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void loadConversations(page - 1)}
              className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50"
            >
              이전
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => void loadConversations(page + 1)}
              className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>
      </PagePanel>

      {(detail || isDetailLoading) && (
        <div className="fixed inset-0 z-40 bg-slate-950/30">
          <div className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">대화 상세</h3>
                <p className="text-sm text-slate-500">운영자용 필드만 표시됩니다.</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                닫기
              </button>
            </div>

            {isDetailLoading ? <p className="px-6 py-8 text-sm text-slate-500">상세 정보를 불러오는 중...</p> : null}

            {detail ? (
              <div className="space-y-6 px-6 py-6">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
                  <div><strong className="mr-2 text-slate-900">답변 상태</strong>{detail.answerStatusLabel}</div>
                  <div><strong className="mr-2 text-slate-900">지연 시간</strong>{formatLatency(detail.responseTimeMs)}</div>
                  <div><strong className="mr-2 text-slate-900">생성일</strong>{formatDateTime(detail.createdAt)}</div>
                  <div><strong className="mr-2 text-slate-900">세션 상태</strong>{detail.sessionStatus}</div>
                  <div><strong className="mr-2 text-slate-900">출처</strong>{detail.hasCitations ? `${detail.citationSummary.length}건` : "없음"}</div>
                  <div><strong className="mr-2 text-slate-900">LLM</strong>{detail.llmExecuted ? "실행됨" : "건너뜀 또는 없음"}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">사용자 질문</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.userQuestion ?? "-"}</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">답변</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.assistantAnswer ?? "-"}</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">출처 요약</h4>
                  {detail.citationSummary.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">출처가 없습니다.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm text-slate-700">
                      {detail.citationSummary.map((citation, index) => (
                        <li key={`${citation.title ?? "source"}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                          {citation.title ?? citation.sourceUrl ?? "출처"} / {citation.sectionTitle ?? "-"} / p.{citation.pageNumber ?? "-"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700 md:grid-cols-2">
                  <div><strong className="mr-2 text-slate-900">Fallback 메시지</strong>{detail.fallbackMessage ?? "-"}</div>
                  <div><strong className="mr-2 text-slate-900">에스컬레이션 사유</strong>{detail.escalationReason ?? "-"}</div>
                  <div><strong className="mr-2 text-slate-900">에스컬레이션 부서</strong>{detail.escalationTargetDepartment ?? "-"}</div>
                  <div><strong className="mr-2 text-slate-900">에스컬레이션 큐</strong>{detail.escalationTargetQueue ?? "-"}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">운영 메모</h4>
                  <textarea
                    value={memo}
                    onChange={(event) => setMemo(event.target.value)}
                    rows={4}
                    className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="메모를 입력하세요"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveMemo()}
                      disabled={isSaving}
                      className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      저장
                    </button>
                    <Link href={detail.advancedAnalysisUrl ?? "/admin/conversation-analysis"} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
                      고급 분석
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
