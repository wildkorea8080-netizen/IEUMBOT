"use client";

import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
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

function formatNumber(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}

function formatPercent(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(1)}%`;
}

function formatScore(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toFixed(3);
}

function formatLatency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}ms`;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricCard(props: { label: string; value: string; helper?: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{props.value}</p>
      {props.helper ? <p className="mt-2 text-xs text-slate-500">{props.helper}</p> : null}
    </article>
  );
}

function QuestionTable(props: {
  title: string;
  description: string;
  rows: AdminQualityQuestionItem[];
  emptyText: string;
}) {
  return (
    <PagePanel title={props.title} description={props.description}>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="w-32 px-3 py-3">시간</th>
              <th className="px-3 py-3">질문</th>
              <th className="w-28 px-3 py-3">상태</th>
              <th className="w-24 px-3 py-3">topScore</th>
              <th className="w-24 px-3 py-3">Prompt</th>
              <th className="w-24 px-3 py-3">Citation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  {props.emptyText}
                </td>
              </tr>
            ) : (
              props.rows.map((item, index) => (
                <tr key={`${item.createdAt}-${index}`}>
                  <td className="px-3 py-4 text-slate-500">{formatDate(item.createdAt)}</td>
                  <td className="px-3 py-4">
                    <p className="line-clamp-2 font-medium text-slate-900">{item.question ?? "-"}</p>
                    {item.fallbackReason ? (
                      <p className="mt-1 line-clamp-1 text-xs text-rose-600">{item.fallbackReason}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-4 text-slate-700">{item.outcome ?? "-"}</td>
                  <td className="px-3 py-4 text-slate-700">{formatScore(item.topScore)}</td>
                  <td className="px-3 py-4 text-slate-700">{formatNumber(item.usedInPromptCount)}</td>
                  <td className="px-3 py-4 text-slate-700">{formatNumber(item.citationCount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PagePanel>
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
    setIsLoading(true);
    setError(null);
    try {
      const [reportResponse, chatbotResponse] = await Promise.all([
        getAdminQualityReport({
          chatbotId: chatbotId || undefined,
          startDate,
          endDate,
          fallbackOnly,
        }),
        getAdminChatbots(),
      ]);
      setReport(reportResponse);
      setChatbots(chatbotResponse.items);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
  }, []);

  const answeredRate = report?.totalConversations
    ? (report.answeredCount / report.totalConversations) * 100
    : 0;

  return (
    <div className="space-y-6">
      <PagePanel
        title="품질 리포트"
        description="운영 대화 로그를 기준으로 RAG 검색 품질, fallback, citation 누락을 점검합니다."
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_160px_160px_auto_auto]">
          <select
            value={chatbotId}
            onChange={(event) => setChatbotId(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">전체 챗봇</option>
            {chatbots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="시작일"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            aria-label="종료일"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={fallbackOnly}
              onChange={(event) => setFallbackOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            fallback만
          </label>
          <button
            type="button"
            onClick={() => void loadReport()}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            조회
          </button>
        </div>
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {isLoading ? <p className="mt-4 text-sm text-slate-500">품질 데이터를 불러오는 중입니다.</p> : null}
        {!isLoading && report && report.totalConversations === 0 ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            아직 분석할 대화 데이터가 없습니다.
          </p>
        ) : null}
      </PagePanel>

      {report && report.totalConversations > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="총 대화 수" value={formatNumber(report.totalConversations)} />
            <MetricCard label="답변 성공률" value={formatPercent(answeredRate)} helper={`${formatNumber(report.answeredCount)}건 답변`} />
            <MetricCard label="fallback 비율" value={formatPercent(report.fallbackRate)} helper={`${formatNumber(report.fallbackCount)}건 fallback`} />
            <MetricCard label="평균 응답시간" value={formatLatency(report.avgLatencyMs)} />
            <MetricCard label="평균 topScore" value={formatScore(report.avgTopScore)} />
            <MetricCard label="LLM 실행률" value={formatPercent(report.llmExecutedRate)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <QuestionTable
                title="최근 실패 질문"
                description="fallback, 제한, 충돌, 이관으로 종료된 최근 질문입니다."
                rows={report.recentFailedQuestions}
                emptyText="최근 실패 질문이 없습니다."
              />
              <QuestionTable
                title="낮은 점수 질문"
                description="답변은 생성됐지만 retrieval topScore가 낮은 질문입니다."
                rows={report.lowScoreQuestions}
                emptyText="낮은 점수 질문이 없습니다."
              />
              <QuestionTable
                title="citation 없는 답변"
                description="답변은 성공했지만 citation이 저장되지 않은 항목입니다."
                rows={report.noCitationAnswers}
                emptyText="citation 없는 답변이 없습니다."
              />
            </div>

            <PagePanel title="fallback reason TOP" description="가장 자주 발생한 fallback 원인입니다.">
              <div className="space-y-2">
                {report.topFallbackReasons.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                    fallback 데이터가 없습니다.
                  </p>
                ) : (
                  report.topFallbackReasons.map((item) => (
                    <div key={item.reason} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <p className="line-clamp-2 text-sm font-medium text-slate-800">{item.reason}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {formatNumber(item.count)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </PagePanel>
          </div>
        </>
      ) : null}
    </div>
  );
}
