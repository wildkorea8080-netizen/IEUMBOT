"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../ui/page-panel";
import { ApiClientError } from "../../lib/api";
import {
  getAdminSecurityEventDetail,
  getAdminSecurityEvents,
  getAdminSecuritySummary,
} from "../../lib/api/security";
import type {
  AdminSecurityEventDetail,
  AdminSecurityEventItem,
  AdminSecuritySummary,
} from "../../lib/api/security-types";

const TEXT = {
  error: "보안 센터 데이터를 불러오는 중 오류가 발생했습니다.",
  title: "보안 센터",
  description: "차단, 대체 응답, 에스컬레이션, 오류 이벤트를 운영 관점에서 빠르게 확인하는 화면입니다.",
  eventTitle: "이벤트 로그",
  eventDescription: "정책 위반, 근거 부족, 상담 연결, 시스템 오류를 기간과 질문 기준으로 조회할 수 있습니다.",
  blockedToday: "오늘 차단 건수",
  fallbackToday: "오늘 대체 응답 건수",
  escalationToday: "오늘 에스컬레이션 건수",
  errorToday: "오늘 오류 건수",
  allEvents: "전체 이벤트",
  searchQuestion: "질문 내용으로 검색",
  search: "검색",
  loading: "이벤트 로그를 불러오는 중입니다.",
  empty: "조회된 보안 이벤트가 없습니다.",
  detail: "상세",
  detailTitle: "보안 이벤트 상세",
  detailDescription: "내부 정책 JSON과 규칙 ID는 노출하지 않습니다.",
  close: "닫기",
  detailLoading: "상세 정보를 불러오는 중입니다.",
  question: "질문",
  answer: "답변",
  eventType: "이벤트 유형",
  status: "상태",
  time: "시간",
  responseTime: "응답 시간",
  reason: "차단/탐지 사유",
  fallback: "대체 응답 메시지",
  escalated: "에스컬레이션 여부",
  chatbot: "챗봇",
  chatbotId: "챗봇 ID",
  conversationId: "대화 ID",
  advanced: "고급 분석 보기",
  yes: "예",
  no: "아니오",
} as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return TEXT.error;
}

function eventBadgeClass(eventType: string): string {
  if (eventType === "BLOCKED") return "bg-rose-100 text-rose-700";
  if (eventType === "FALLBACK") return "bg-amber-100 text-amber-700";
  if (eventType === "ESCALATION") return "bg-blue-100 text-blue-700";
  return "bg-slate-200 text-slate-700";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function formatLatency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value}ms`;
}

function SummaryCard(props: { title: string; value: number; className: string }) {
  return (
    <div className={`rounded-2xl border p-5 ${props.className}`}>
      <p className="text-sm font-medium">{props.title}</p>
      <p className="mt-3 text-3xl font-semibold">{props.value}</p>
    </div>
  );
}

export function SecurityCenter() {
  const [summary, setSummary] = useState<AdminSecuritySummary | null>(null);
  const [items, setItems] = useState<AdminSecurityEventItem[]>([]);
  const [detail, setDetail] = useState<AdminSecurityEventDetail | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [eventType, setEventType] = useState("");
  const [question, setQuestion] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  async function loadEvents(nextPage = page) {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryResponse, eventsResponse] = await Promise.all([
        getAdminSecuritySummary(),
        getAdminSecurityEvents({
          from: from || undefined,
          to: to || undefined,
          eventType: eventType || undefined,
          question: question.trim() || undefined,
          page: nextPage,
          pageSize,
        }),
      ]);
      setSummary(summaryResponse);
      setItems(eventsResponse.items);
      setTotalCount(eventsResponse.totalCount);
      setPage(eventsResponse.page);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents(1);
  }, []);

  async function openDetail(eventId: string) {
    setIsDetailLoading(true);
    setError(null);
    try {
      const response = await getAdminSecurityEventDetail(eventId);
      setDetail(response);
    } catch (detailError) {
      setError(getErrorMessage(detailError));
    } finally {
      setIsDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel title={TEXT.title} description={TEXT.description}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title={TEXT.blockedToday} value={summary?.blockedToday ?? 0} className="border-rose-200 bg-rose-50 text-rose-700" />
          <SummaryCard title={TEXT.fallbackToday} value={summary?.fallbackToday ?? 0} className="border-amber-200 bg-amber-50 text-amber-700" />
          <SummaryCard title={TEXT.escalationToday} value={summary?.escalationToday ?? 0} className="border-blue-200 bg-blue-50 text-blue-700" />
          <SummaryCard title={TEXT.errorToday} value={summary?.errorToday ?? 0} className="border-slate-200 bg-slate-50 text-slate-700" />
        </div>
      </PagePanel>

      <PagePanel title={TEXT.eventTitle} description={TEXT.eventDescription}>
        <div className="grid gap-3 lg:grid-cols-[160px_160px_170px_1fr_auto]">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">{TEXT.allEvents}</option>
            <option value="BLOCKED">차단 (BLOCKED)</option>
            <option value="FALLBACK">대체 응답</option>
            <option value="ESCALATION">에스컬레이션</option>
            <option value="ERROR">오류</option>
          </select>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={TEXT.searchQuestion} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="button" onClick={() => void loadEvents(1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            {TEXT.search}
          </button>
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {isLoading ? <p className="mt-4 text-sm text-slate-500">{TEXT.loading}</p> : null}

        {!isLoading ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="w-44 px-3 py-3">시간</th>
                  <th className="px-3 py-3">사용자 질문</th>
                  <th className="w-28 px-3 py-3">이벤트 유형</th>
                  <th className="w-40 px-3 py-3">사유</th>
                  <th className="w-36 px-3 py-3">챗봇</th>
                  <th className="w-28 px-3 py-3">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                      {TEXT.empty}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.eventId}>
                      <td className="px-3 py-4 text-slate-500">{formatDateTime(item.time)}</td>
                      <td className="px-3 py-4">
                        <p className="line-clamp-2 text-slate-900">{item.questionPreview ?? "-"}</p>
                      </td>
                      <td className="px-3 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${eventBadgeClass(item.eventType)}`}>
                          {item.eventType}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-slate-700">{item.reasonLabel}</td>
                      <td className="px-3 py-4 text-slate-700">{item.chatbotName}</td>
                      <td className="px-3 py-4">
                        <button type="button" onClick={() => void openDetail(item.eventId)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700">
                          {TEXT.detail}
                        </button>
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
            <button type="button" disabled={page <= 1} onClick={() => void loadEvents(page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">
              이전
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => void loadEvents(page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">
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
                <h3 className="text-lg font-semibold text-slate-900">{TEXT.detailTitle}</h3>
                <p className="text-sm text-slate-500">{TEXT.detailDescription}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                {TEXT.close}
              </button>
            </div>

            {isDetailLoading ? <p className="px-6 py-8 text-sm text-slate-500">{TEXT.detailLoading}</p> : null}

            {detail ? (
              <div className="space-y-6 px-6 py-6">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
                  <div><strong className="mr-2 text-slate-900">{TEXT.eventType}</strong>{detail.eventType}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.status}</strong>{detail.status}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.time}</strong>{formatDateTime(detail.time)}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.responseTime}</strong>{formatLatency(detail.responseTimeMs)}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">{TEXT.question}</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.userQuestion ?? "-"}</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">{TEXT.answer}</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.assistantAnswer ?? "-"}</p>
                </div>

                <div className="grid gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700 md:grid-cols-2">
                  <div><strong className="mr-2 text-slate-900">{TEXT.reason}</strong>{detail.reasonLabel}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.fallback}</strong>{detail.fallbackMessage ?? "-"}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.escalated}</strong>{detail.escalated ? TEXT.yes : TEXT.no}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.chatbot}</strong>{detail.chatbotName}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.chatbotId}</strong>{detail.chatbotId}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.conversationId}</strong>{detail.sessionId}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={detail.advancedAnalysisUrl ?? "/admin/conversation-analysis"} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
                    {TEXT.advanced}
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
