"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../../../components/ui/empty-state";
import { AdminIcon } from "../../../components/ui/admin-icons";
import { PageHeader } from "../../../components/ui/page-header";
import { SectionCard } from "../../../components/ui/section-card";
import { StatCard } from "../../../components/ui/stat-card";
import { StatusBadge } from "../../../components/ui/status-badge";
import { ApiClientError } from "../../../lib/api";
import {
  getDashboardQuestionTypes,
  getDashboardRecentChats,
  getDashboardSummary,
  getDashboardUsageTrend,
} from "../../../lib/api/admin-operations";
import type {
  DashboardQuestionTypeItem,
  DashboardRecentChatItem,
  DashboardSummaryResponse,
  DashboardUsageTrendItem,
} from "../../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "대시보드 데이터를 불러오지 못했습니다.";
}

function toDateRangeLast30Days(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}

function formatChartDate(value: string): string {
  return value.slice(5).replace("-", ".");
}

function getRecentStatusTone(status: DashboardRecentChatItem["status"]): "success" | "warning" | "info" {
  if (status === "success") return "success";
  if (status === "escalation") return "warning";
  return "info";
}

function getRecentStatusLabel(status: DashboardRecentChatItem["status"]): string {
  if (status === "success") return "성공";
  if (status === "escalation") return "이관";
  return "대체응답";
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [usageTrend, setUsageTrend] = useState<DashboardUsageTrendItem[]>([]);
  const [questionTypes, setQuestionTypes] = useState<DashboardQuestionTypeItem[]>([]);
  const [recentChats, setRecentChats] = useState<DashboardRecentChatItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => toDateRangeLast30Days(), []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [summaryResponse, usageTrendResponse, questionTypeResponse, recentChatResponse] =
          await Promise.all([
            getDashboardSummary(),
            getDashboardUsageTrend(range),
            getDashboardQuestionTypes(range),
            getDashboardRecentChats({ limit: 8 }),
          ]);

        if (!mounted) return;

        setSummary(summaryResponse);
        setUsageTrend(usageTrendResponse);
        setQuestionTypes(questionTypeResponse);
        setRecentChats(recentChatResponse);
      } catch (loadError) {
        if (!mounted) return;
        setError(getErrorMessage(loadError));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [range]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="기관관리자 대시보드"
        description="사용량, 질문 분포, 최근 대화 현황을 한 화면에서 확인할 수 있도록 SaaS 스타일로 정리했습니다."
        breadcrumbs={["기관관리자", "대시보드"]}
        badge={
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            ORG ADMIN
          </span>
        }
        actions={
          <>
            <Link
              href="/admin/conversations"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <AdminIcon name="conversation" className="h-4 w-4" />
              대화 관리
            </Link>
            <Link
              href="/admin/knowledge/register"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white"
            >
              <AdminIcon name="plus" className="h-4 w-4" />
              지식 등록
            </Link>
          </>
        }
      />

      {error ? (
        <SectionCard title="오류" description="대시보드 데이터를 불러오는 중 문제가 발생했습니다.">
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        </SectionCard>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="총 사용자 수" value={summary?.totalUsers ?? "-"} icon="users" />
        <StatCard label="총 대화 수" value={summary?.totalConversations ?? "-"} icon="conversation" tone="neutral" />
        <StatCard
          label="답변 성공률"
          value={summary ? `${summary.successRate}%` : "-"}
          icon="success"
          tone="success"
        />
        <StatCard
          label="평균 응답시간"
          value={summary ? `${summary.avgResponseTime}s` : "-"}
          icon="usage"
          tone="primary"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <SectionCard title="사용량 추이" description="최근 30일 기준 날짜별 사용자 수와 대화 수를 표시합니다.">
          {isLoading ? (
            <p className="text-sm text-slate-500">사용량 추이를 불러오는 중입니다...</p>
          ) : usageTrend.length === 0 ? (
            <EmptyState
              title="사용량 데이터가 아직 없습니다"
              description="날짜별 사용 데이터가 누적되면 이 영역에 그래프를 표시합니다."
              icon="usage"
            />
          ) : (
            <div className="h-[320px] rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={usageTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="#64748B" tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748B" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
                    }}
                    labelFormatter={(label) => `날짜 ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="messages"
                    name="대화 수"
                    stroke="#4F46E5"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="users"
                    name="사용자 수"
                    stroke="#10B981"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="질문 유형 분석" description="카테고리별 질문 수를 막대 그래프로 표시합니다.">
          {isLoading ? (
            <p className="text-sm text-slate-500">질문 유형을 집계하는 중입니다...</p>
          ) : questionTypes.length === 0 ? (
            <EmptyState
              title="질문 유형 데이터가 아직 없습니다"
              description="카테고리 집계 데이터가 생기면 이 영역에 자동으로 반영됩니다."
              icon="conversation"
            />
          ) : (
            <div className="h-[320px] rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={questionTypes} layout="vertical" margin={{ left: 12, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    stroke="#64748B"
                    tickLine={false}
                    axisLine={false}
                    width={96}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
                    }}
                  />
                  <Bar dataKey="count" name="질문 수" fill="#4F46E5" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="최근 대화"
        description="최근 대화의 시간, 질문, 상태를 빠르게 확인할 수 있도록 리스트로 구성했습니다."
        action={
          <Link href="/admin/conversations" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            전체 보기
          </Link>
        }
      >
        {isLoading ? (
          <p className="text-sm text-slate-500">최근 대화를 불러오는 중입니다...</p>
        ) : recentChats.length === 0 ? (
          <EmptyState
            title="최근 대화가 없습니다"
            description="대화가 쌓이면 최근 대화 리스트가 이곳에 표시됩니다."
            icon="conversation"
          />
        ) : (
          <div className="grid gap-3">
            {recentChats.map((item) => (
              <div
                key={`${item.createdAt}-${item.question ?? ""}`}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 md:grid-cols-[180px_1fr_auto] md:items-center"
              >
                <div className="text-sm font-medium text-slate-700">
                  {new Date(item.createdAt).toLocaleString("ko-KR")}
                </div>
                <div className="text-sm text-slate-900">{item.question ?? "질문 내용이 없습니다."}</div>
                <div className="justify-self-start md:justify-self-end">
                  <StatusBadge tone={getRecentStatusTone(item.status)}>
                    {getRecentStatusLabel(item.status)}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
