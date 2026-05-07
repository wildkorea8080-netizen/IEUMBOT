"use client";

import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots, getAdminRoiDashboard } from "../../../lib/api/admin-operations";
import type {
  AdminChatbotItem,
  AdminRoiDashboardResponse,
  AdminRoiDailyTrendItem,
  AdminRoiTopicItem,
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
  return "ROI Dashboard를 불러오지 못했습니다.";
}

function formatNumber(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}

function formatPercent(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(1)}%`;
}

function formatLatency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}ms`;
}

function formatMinutes(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value.toLocaleString("ko-KR")}분`;
}

function formatCurrency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value.toLocaleString("ko-KR")}원`;
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

function ResolutionChart({ rows }: { rows: AdminRoiDailyTrendItem[] }) {
  const width = 720;
  const height = 220;
  const padding = 28;
  const points = rows
    .map((row, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(1, rows.length - 1);
      const y = height - padding - (row.autoResolutionRate / 100) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-60 w-full">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#CBD5E1" strokeWidth="1" />
        <polyline fill="none" stroke="#0F766E" strokeWidth="3" points={points} />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{rows[0]?.date ?? "-"}</span>
        <span>{rows[rows.length - 1]?.date ?? "-"}</span>
      </div>
    </div>
  );
}

function TopicTable(props: { title: string; description: string; rows: AdminRoiTopicItem[]; emptyText: string }) {
  return (
    <PagePanel title={props.title} description={props.description}>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-3">주제</th>
              <th className="w-28 px-3 py-3">건수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {props.rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-8 text-center text-sm text-slate-500">
                  {props.emptyText}
                </td>
              </tr>
            ) : (
              props.rows.map((item) => (
                <tr key={item.topic}>
                  <td className="px-3 py-4 font-medium text-slate-900">{item.topic}</td>
                  <td className="px-3 py-4 text-slate-700">{formatNumber(item.count)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PagePanel>
  );
}

export default function AdminRoiDashboardPage() {
  const initialRange = useMemo(() => rangeDate(30), []);
  const [report, setReport] = useState<AdminRoiDashboardResponse | null>(null);
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
      const [roiResponse, chatbotResponse] = await Promise.all([
        getAdminRoiDashboard({
          chatbotId: chatbotId || undefined,
          startDate,
          endDate,
        }),
        getAdminChatbots(),
      ]);
      setReport(roiResponse);
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
        title="ROI Dashboard"
        description="AI 챗봇이 자동 해결한 상담량과 예상 절감 시간, 절감 비용을 확인합니다."
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_160px_160px_auto]">
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
        </div>
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {isLoading ? <p className="mt-4 text-sm text-slate-500">ROI 데이터를 불러오는 중입니다.</p> : null}
        {!isLoading && report && report.totalQuestions === 0 ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            아직 분석할 운영 데이터가 없습니다.
          </p>
        ) : null}
      </PagePanel>

      {report && report.totalQuestions > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="총 상담 수" value={formatNumber(report.totalQuestions)} />
            <MetricCard
              label="자동 해결률"
              value={formatPercent(report.autoResolutionRate)}
              helper={`${formatNumber(report.autoAnsweredCount)}건 자동 해결`}
            />
            <MetricCard label="평균 응답시간" value={formatLatency(report.avgLatencyMs)} />
            <MetricCard label="절감 시간" value={formatMinutes(report.estimatedSavedMinutes)} />
            <MetricCard label="절감 비용" value={formatCurrency(report.estimatedSavedCost)} />
          </div>

          <PagePanel title="최근 30일 자동 해결률" description="일자별 자동 답변과 fallback 비율을 함께 반영한 추세입니다.">
            <ResolutionChart rows={report.dailyTrend} />
          </PagePanel>

          <div className="grid gap-6 xl:grid-cols-2">
            <TopicTable
              title="자동화 TOP 문의"
              description="AI가 자동 해결한 문의의 주요 주제입니다."
              rows={report.topAutomatedTopics}
              emptyText="자동 해결된 문의가 없습니다."
            />
            <TopicTable
              title="상담원 이관 TOP 문의"
              description="fallback 또는 이관 신호가 있는 문의의 주요 주제입니다."
              rows={report.topEscalatedTopics}
              emptyText="상담원 이관 문의가 없습니다."
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
