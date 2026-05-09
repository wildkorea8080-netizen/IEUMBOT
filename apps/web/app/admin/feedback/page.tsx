"use client";

import { useEffect, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
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

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "데이터를 불러오지 못했습니다.";
}

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function MetricCard(props: { label: string; value: string; helper?: string; accent?: boolean }) {
  return (
    <article className={`rounded-lg border p-4 ${props.accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <p className="text-sm text-slate-500">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{props.value}</p>
      {props.helper ? <p className="mt-2 text-xs text-slate-500">{props.helper}</p> : null}
    </article>
  );
}

function PositiveBar(props: { rate: number }) {
  const pct = Math.min(100, Math.max(0, props.rate));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-600">{formatPercent(pct)}</span>
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
      setError(errorMessage(err));
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
      {/* 헤더 + 필터 */}
      <PagePanel
        title="피드백 현황"
        description="사용자가 남긴 👍/👎 피드백을 기반으로 답변 품질을 분석합니다."
      >
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={chatbotId}
            onChange={(e) => { setChatbotId(e.target.value); setPage(0); }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">전체 챗봇</option>
            {chatbots.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setPage(0); void loadAll(chatbotId, 0); }}
            disabled={isLoading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading ? "로딩 중..." : "새로고침"}
          </button>
        </div>
        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        ) : null}
      </PagePanel>

      {/* 요약 카드 4개 */}
      {summary ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="전체 assistant 메시지" value={formatNumber(summary.totalAssistantMessages)} />
          <MetricCard
            label="피드백 수신"
            value={formatNumber(summary.feedbackReceived)}
            helper={summary.totalAssistantMessages > 0
              ? `${((summary.feedbackReceived / summary.totalAssistantMessages) * 100).toFixed(1)}% 참여율`
              : undefined}
          />
          <MetricCard
            label="👍 좋아요"
            value={formatNumber(summary.thumbsUp)}
            helper={summary.feedbackReceived > 0
              ? `긍정률 ${formatPercent(summary.positiveRate)}`
              : undefined}
            accent={summary.positiveRate >= 70}
          />
          <MetricCard label="👎 싫어요" value={formatNumber(summary.thumbsDown)} />
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : null}

      {/* 문서별 피드백 테이블 */}
      <PagePanel title="문서별 피드백" description="참조된 문서 기준으로 집계한 👍/👎 수와 긍정률입니다.">
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full table-fixed text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">문서명</th>
                <th className="w-20 px-3 py-3 text-right">👍</th>
                <th className="w-20 px-3 py-3 text-right">👎</th>
                <th className="w-20 px-3 py-3 text-right">합계</th>
                <th className="w-40 px-3 py-3">긍정률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {byDocument.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">
                    아직 피드백 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                byDocument.map((item, i) => (
                  <tr key={item.documentId ?? i}>
                    <td className="px-3 py-3">
                      <p className="line-clamp-1 font-medium text-slate-800">{item.documentName}</p>
                      {item.documentId ? (
                        <p className="mt-0.5 text-xs text-slate-400 truncate">{item.documentId}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right text-emerald-700">{formatNumber(item.thumbsUp)}</td>
                    <td className="px-3 py-3 text-right text-red-600">{formatNumber(item.thumbsDown)}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatNumber(item.totalFeedback)}</td>
                    <td className="px-3 py-3">
                      <PositiveBar rate={item.positiveRate} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      {/* 낮은 평점 메시지 목록 */}
      <PagePanel
        title="👎 낮은 평점 메시지"
        description="싫어요를 받은 메시지 목록입니다. 클릭하면 채팅 로그로 이동합니다."
      >
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full table-fixed text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">질문</th>
                <th className="w-64 px-3 py-3">답변(앞 100자)</th>
                <th className="w-36 px-3 py-3">피드백 일시</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {lowRated.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-sm text-slate-400">
                    👎 피드백이 없습니다.
                  </td>
                </tr>
              ) : (
                lowRated.map((item) => (
                  <tr
                    key={item.messageId}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      window.location.href = `/admin/chat-logs?messageId=${item.messageId}`;
                    }}
                  >
                    <td className="px-3 py-3">
                      <p className="line-clamp-2 text-slate-800">{item.normalizedQuery || "-"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="line-clamp-2 text-xs text-slate-500">
                        {item.content.slice(0, 100)}{item.content.length > 100 ? "..." : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{formatDate(item.feedbackAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>{lowRatedTotal.toLocaleString("ko-KR")}개 중 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, lowRatedTotal)}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                이전
              </button>
              <span className="px-2 py-1.5">{page + 1} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}
