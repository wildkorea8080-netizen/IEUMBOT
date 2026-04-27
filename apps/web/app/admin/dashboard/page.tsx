"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
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
  return "대시보드 데이터를 불러오는 중 오류가 발생했습니다.";
}

function toDateRangeLast30Days(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}

function statusLabel(status: DashboardRecentChatItem["status"]): string {
  if (status === "success") return "성공";
  if (status === "escalation") return "이관";
  return "대체응답";
}

function statusClassName(status: DashboardRecentChatItem["status"]): string {
  if (status === "success") return "bg-emerald-50 text-emerald-700";
  if (status === "escalation") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function UsageTrendChart({ rows }: { rows: DashboardUsageTrendItem[] }) {
  const width = 640;
  const height = 240;
  const padding = 28;
  const maxValue = Math.max(1, ...rows.map((row) => Math.max(row.users, row.messages)));

  const pointsUsers = rows
    .map((row, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(1, rows.length - 1);
      const y = height - padding - (row.users / maxValue) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const pointsMessages = rows
    .map((row, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(1, rows.length - 1);
      const y = height - padding - (row.messages / maxValue) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-500" />사용자</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />메시지</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#CBD5E1" strokeWidth="1" />
        <polyline fill="none" stroke="#3B82F6" strokeWidth="2.5" points={pointsUsers} />
        <polyline fill="none" stroke="#10B981" strokeWidth="2.5" points={pointsMessages} />
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-slate-500">
        <span>{rows[0]?.date ?? "-"}</span>
        <span>{rows[rows.length - 1]?.date ?? "-"}</span>
      </div>
    </div>
  );
}

function QuestionTypeChart({ rows }: { rows: DashboardQuestionTypeItem[] }) {
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="rounded border border-slate-200 p-3">
      <div className="space-y-3">
        {rows.map((row) => {
          const widthPercent = Math.round((row.count / maxCount) * 100);
          return (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span>{row.label}</span>
                <span>{row.count}</span>
              </div>
              <div className="h-2 rounded bg-slate-100">
                <div className="h-2 rounded bg-blue-500" style={{ width: `${widthPercent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
        const [summaryRes, trendRes, typeRes, recentRes] = await Promise.all([
          getDashboardSummary(),
          getDashboardUsageTrend(range),
          getDashboardQuestionTypes(range),
          getDashboardRecentChats({ limit: 12 }),
        ]);
        if (!mounted) return;
        setSummary(summaryRes);
        setUsageTrend(trendRes);
        setQuestionTypes(typeRes);
        setRecentChats(recentRes);
      } catch (err) {
        if (!mounted) return;
        setError(getErrorMessage(err));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [range]);

  return (
    <div className="space-y-4">
      <PagePanel title="주요 메뉴" description="자주 사용하는 운영 화면으로 바로 이동할 수 있습니다.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            { href: "/admin/ai/basic", title: "AI 설정", description: "기본 설정, 대화 스타일, 조건별 설정" },
            { href: "/admin/knowledge/register", title: "지식관리", description: "지식 등록과 목록 관리" },
            { href: "/admin/conversations", title: "대화관리", description: "일반 대화 이력 조회" },
            { href: "/admin/install-guide", title: "설치/연동", description: "위젯 설치 코드와 테스트 안내" },
            { href: "/admin/security", title: "운영관리", description: "보안센터, 사용량, 감사로그 확인" },
            { href: "/admin/knowledge/list", title: "지식 목록", description: "등록 자료 상태와 색인 결과 확인" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </Link>
          ))}
        </div>
      </PagePanel>

      <PagePanel title="운영 현황 대시보드" description="기관 단위 운영 지표, 사용량 추이, 질문 유형, 최근 대화를 확인합니다.">
        {isLoading ? <p className="text-sm text-slate-600">대시보드 로딩 중...</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {!isLoading && !error && summary ? (
          <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">총 사용자(세션)</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.totalUsers}</p>
              </article>
              <article className="rounded border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">총 대화 수</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.totalConversations}</p>
              </article>
              <article className="rounded border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">응답 성공률</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.successRate}%</p>
              </article>
              <article className="rounded border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">평균 응답 시간</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.avgResponseTime}s</p>
              </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">사용량 추이 (최근 30일)</h3>
                <UsageTrendChart rows={usageTrend} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">질문 유형 분석</h3>
                <QuestionTypeChart rows={questionTypes} />
              </div>
            </section>

            <section className="rounded border border-slate-200">
              <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-800">최근 대화</div>
              <div className="divide-y divide-slate-100">
                {recentChats.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500">최근 대화 데이터가 없습니다.</p>
                ) : (
                  recentChats.map((item) => (
                    <div key={`${item.createdAt}-${item.question ?? ""}`} className="flex items-start justify-between gap-3 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{item.question ?? "(질문 없음)"}</p>
                        <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("ko-KR")}</p>
                      </div>
                      <span className={`shrink-0 rounded px-2 py-1 text-xs ${statusClassName(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}
