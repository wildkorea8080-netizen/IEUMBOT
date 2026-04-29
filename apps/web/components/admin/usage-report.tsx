"use client";

import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../ui/page-panel";
import { ApiClientError } from "../../lib/api";
import { getAdminUsageChatbots, getAdminUsageDaily, getAdminUsageSummary } from "../../lib/api/usage";
import type {
  AdminChatbotUsageItem,
  AdminUsageDailyItem,
  AdminUsageLimitStatus,
  AdminUsageSummary,
} from "../../lib/api/usage-types";

const TEXT = {
  title: "사용량 리포트",
  description: "기관별 사용량, 계약 한도, 챗봇별 운영 지표를 한 화면에서 확인합니다.",
  totalConversations: "총 대화 수",
  monthlyUsage: "이번 달 사용량",
  monthlyRate: "월 한도 대비 사용률",
  activeChatbots: "활성 챗봇 수",
  activeWidgets: "활성 위젯 수",
  usageTrendTitle: "사용량 그래프",
  usageTrendDescription: "일별 대화 수 추이를 기간별로 확인합니다.",
  chatbotUsageTitle: "챗봇별 사용량",
  chatbotUsageDescription: "챗봇별 대화 수, 응답 속도, 성공률, 대체 응답 비율을 확인합니다.",
  limitTitle: "제한 상태",
  limitDescription: "계약 기준 한도와 현재 사용 상태를 표시합니다.",
  loading: "사용량 데이터를 불러오는 중입니다.",
  empty: "표시할 사용량 데이터가 없습니다.",
  error: "사용량 데이터를 불러오는 중 오류가 발생했습니다.",
  chatbotName: "챗봇명",
  conversationCount: "대화 수",
  averageLatency: "평균 응답시간",
  successRate: "성공률",
  fallbackRate: "대체 응답 비율",
  labelNormal: "정상",
  labelWarning: "임박",
  labelExceeded: "초과",
  range7: "7일",
  range30: "30일",
  rangeCustom: "사용자 지정",
  search: "조회",
  from: "시작일",
  to: "종료일",
  used: "사용",
  limit: "한도",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return TEXT.error;
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
  return `${Math.round(value)}ms`;
}

function rangeDate(days: number): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}

function cardTone(status?: string): string {
  if (status === "exceeded") return "border-rose-200 bg-rose-50";
  if (status === "warning") return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-white";
}

function statusTone(status?: string): string {
  if (status === "exceeded") return "bg-rose-100 text-rose-700";
  if (status === "warning") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function SummaryCard(props: { title: string; value: string; helper?: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{props.title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{props.value}</p>
      {props.helper ? <p className="mt-2 text-xs text-slate-500">{props.helper}</p> : null}
    </article>
  );
}

function UsageTrendChart({ rows }: { rows: AdminUsageDailyItem[] }) {
  const width = 720;
  const height = 240;
  const padding = 28;
  const maxValue = Math.max(1, ...rows.map((row) => row.conversationCount));
  const points = rows
    .map((row, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(1, rows.length - 1);
      const y = height - padding - (row.conversationCount / maxValue) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#CBD5E1" strokeWidth="1" />
        <polyline fill="none" stroke="#1D4ED8" strokeWidth="3" points={points} />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{rows[0]?.date ?? "-"}</span>
        <span>{rows[rows.length - 1]?.date ?? "-"}</span>
      </div>
    </div>
  );
}

function LimitCard({ item }: { item: AdminUsageLimitStatus }) {
  return (
    <article className={`rounded-2xl border p-5 ${cardTone(item.status)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{item.label}</p>
          <p className="mt-2 text-sm text-slate-600">
            {TEXT.used} {formatNumber(item.used)} / {TEXT.limit} {formatNumber(item.limit)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatPercent(item.usageRate)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(item.status)}`}>
          {item.statusLabel}
        </span>
      </div>
    </article>
  );
}

export function UsageReport() {
  const [summary, setSummary] = useState<AdminUsageSummary | null>(null);
  const [daily, setDaily] = useState<AdminUsageDailyItem[]>([]);
  const [chatbots, setChatbots] = useState<AdminChatbotUsageItem[]>([]);
  const [rangeType, setRangeType] = useState("30d");
  const [from, setFrom] = useState(rangeDate(30).from);
  const [to, setTo] = useState(rangeDate(30).to);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      rangeType,
      from: rangeType === "custom" ? from : undefined,
      to: rangeType === "custom" ? to : undefined,
    }),
    [from, rangeType, to],
  );

  async function loadUsage() {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryResponse, dailyResponse, chatbotResponse] = await Promise.all([
        getAdminUsageSummary(),
        getAdminUsageDaily(query),
        getAdminUsageChatbots(query),
      ]);
      setSummary(summaryResponse);
      setDaily(dailyResponse.items);
      setChatbots(chatbotResponse.items);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsage();
  }, []);

  useEffect(() => {
    if (rangeType === "7d") {
      const next = rangeDate(7);
      setFrom(next.from);
      setTo(next.to);
    } else if (rangeType === "30d") {
      const next = rangeDate(30);
      setFrom(next.from);
      setTo(next.to);
    }
  }, [rangeType]);

  return (
    <div className="space-y-6">
      <PagePanel title={TEXT.title} description={TEXT.description}>
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {isLoading ? <p className="text-sm text-slate-500">{TEXT.loading}</p> : null}
        {!isLoading && summary ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard title={TEXT.totalConversations} value={formatNumber(summary.totalConversations)} />
            <SummaryCard title={TEXT.monthlyUsage} value={formatNumber(summary.monthlyUsage)} />
            <SummaryCard
              title={TEXT.monthlyRate}
              value={formatPercent(summary.monthlyUsageRate)}
              helper={summary.monthlyLimit ? `월 한도 ${formatNumber(summary.monthlyLimit)}` : "월 한도 미설정"}
            />
            <SummaryCard title={TEXT.activeChatbots} value={formatNumber(summary.activeChatbots)} />
            <SummaryCard title={TEXT.activeWidgets} value={formatNumber(summary.activeWidgets)} />
          </div>
        ) : null}
      </PagePanel>

      <PagePanel title={TEXT.usageTrendTitle} description={TEXT.usageTrendDescription}>
        <div className="grid gap-3 lg:grid-cols-[160px_160px_160px_auto]">
          <select value={rangeType} onChange={(event) => setRangeType(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="7d">{TEXT.range7}</option>
            <option value="30d">{TEXT.range30}</option>
            <option value="custom">{TEXT.rangeCustom}</option>
          </select>
          <input type="date" aria-label={TEXT.from} value={from} onChange={(event) => setFrom(event.target.value)} disabled={rangeType !== "custom"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
          <input type="date" aria-label={TEXT.to} value={to} onChange={(event) => setTo(event.target.value)} disabled={rangeType !== "custom"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
          <button type="button" onClick={() => void loadUsage()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            {TEXT.search}
          </button>
        </div>

        <div className="mt-4">
          {daily.length > 0 ? <UsageTrendChart rows={daily} /> : <p className="text-sm text-slate-500">{TEXT.empty}</p>}
        </div>
      </PagePanel>

      <PagePanel title={TEXT.chatbotUsageTitle} description={TEXT.chatbotUsageDescription}>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full table-fixed text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">{TEXT.chatbotName}</th>
                <th className="w-28 px-3 py-3">{TEXT.conversationCount}</th>
                <th className="w-32 px-3 py-3">{TEXT.averageLatency}</th>
                <th className="w-28 px-3 py-3">{TEXT.successRate}</th>
                <th className="w-28 px-3 py-3">{TEXT.fallbackRate}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {chatbots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">{TEXT.empty}</td>
                </tr>
              ) : (
                chatbots.map((item) => (
                  <tr key={item.chatbotId}>
                    <td className="px-3 py-4 text-slate-900">{item.chatbotName}</td>
                    <td className="px-3 py-4 text-slate-700">{formatNumber(item.conversationCount)}</td>
                    <td className="px-3 py-4 text-slate-700">{formatLatency(item.averageResponseTimeMs)}</td>
                    <td className="px-3 py-4 text-slate-700">{formatPercent(item.successRate)}</td>
                    <td className="px-3 py-4 text-slate-700">{formatPercent(item.fallbackRate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <PagePanel title={TEXT.limitTitle} description={TEXT.limitDescription}>
        <div className="grid gap-4 lg:grid-cols-3">
          {summary?.limits.map((item) => <LimitCard key={item.key} item={item} />)}
        </div>
      </PagePanel>
    </div>
  );
}
