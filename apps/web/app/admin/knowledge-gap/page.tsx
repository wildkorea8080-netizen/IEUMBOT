"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots, getAdminKnowledgeGap } from "../../../lib/api/admin-operations";
import type {
  AdminChatbotItem,
  AdminKnowledgeGapItem,
  AdminKnowledgeGapResponse,
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
  return "Knowledge Gap 리포트를 불러오지 못했습니다.";
}

function formatNumber(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}

function formatScore(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toFixed(3);
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

function GapTable(props: {
  title: string;
  description: string;
  rows: AdminKnowledgeGapItem[];
  emptyText: string;
}) {
  return (
    <PagePanel title={props.title} description={props.description}>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-3">질문</th>
              <th className="w-24 px-3 py-3">횟수</th>
              <th className="w-28 px-3 py-3">fallback</th>
              <th className="w-28 px-3 py-3">평균 score</th>
              <th className="w-36 px-3 py-3">마지막 질문</th>
              <th className="w-52 px-3 py-3">추천 보강 주제</th>
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
                <tr key={`${item.question}-${index}`}>
                  <td className="px-3 py-4">
                    <p className="line-clamp-2 font-medium text-slate-900">{item.question}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.recommendedAction}</p>
                  </td>
                  <td className="px-3 py-4 text-slate-700">{formatNumber(item.count)}</td>
                  <td className="px-3 py-4 text-slate-700">{formatNumber(item.fallbackCount)}</td>
                  <td className="px-3 py-4 text-slate-700">{formatScore(item.avgTopScore)}</td>
                  <td className="px-3 py-4 text-slate-700">{formatDate(item.lastAskedAt)}</td>
                  <td className="px-3 py-4 text-slate-900">{item.recommendedTopic}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PagePanel>
  );
}

export default function AdminKnowledgeGapPage() {
  const initialRange = useMemo(() => rangeDate(30), []);
  const [report, setReport] = useState<AdminKnowledgeGapResponse | null>(null);
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setIsLoading(true);
    setError(null);
    try {
      const [gapResponse, chatbotResponse] = await Promise.all([
        getAdminKnowledgeGap({
          chatbotId: chatbotId || undefined,
          startDate,
          endDate,
        }),
        getAdminChatbots(),
      ]);
      setReport(gapResponse);
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

  return (
    <div className="space-y-6">
      <PagePanel
        title="Knowledge Gap"
        description="fallback, 낮은 retrieval score, prompt 미사용 질문을 묶어 지식 보강 후보를 찾습니다."
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
          <button
            type="button"
            onClick={() => void loadReport()}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            조회
          </button>
          <Link
            href="/admin/knowledge/register"
            className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700"
          >
            지식 등록으로 이동
          </Link>
        </div>
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {isLoading ? <p className="mt-4 text-sm text-slate-500">Knowledge Gap 데이터를 불러오는 중입니다.</p> : null}
        {!isLoading && report && report.totalAnalyzed === 0 ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            아직 분석할 대화 데이터가 없습니다.
          </p>
        ) : null}
      </PagePanel>

      {report && report.totalAnalyzed > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="분석 대화 수" value={formatNumber(report.totalAnalyzed)} />
            <MetricCard label="fallback 질문 수" value={formatNumber(report.fallbackQuestions.length)} />
            <MetricCard label="low score 질문 수" value={formatNumber(report.lowScoreQuestions.length)} />
            <MetricCard label="반복 질문 수" value={formatNumber(report.repeatedQuestions.length)} />
          </div>

          <GapTable
            title="추천 지식 보강 주제"
            description="운영 질문에서 반복적으로 부족 신호가 감지된 지식 보강 후보입니다."
            rows={report.suggestedKnowledgeTopics}
            emptyText="추천할 지식 보강 주제가 없습니다."
          />
          <GapTable
            title="fallback 질문"
            description="fallbackReason이 NONE이 아닌 질문 그룹입니다."
            rows={report.fallbackQuestions}
            emptyText="fallback 질문이 없습니다."
          />
          <GapTable
            title="낮은 score 질문"
            description="retrieval topScore가 0.35 미만인 질문 그룹입니다."
            rows={report.lowScoreQuestions}
            emptyText="낮은 score 질문이 없습니다."
          />
          <GapTable
            title="반복 질문"
            description="동일 질문 normalize 기준으로 2회 이상 발생한 gap 질문입니다."
            rows={report.repeatedQuestions}
            emptyText="반복 gap 질문이 없습니다."
          />
        </>
      ) : null}
    </div>
  );
}
