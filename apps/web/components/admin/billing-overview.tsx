"use client";

import { useEffect, useState } from "react";

import { ApiClientError } from "../../lib/api";
import { getAdminBillingUsage } from "../../lib/api/billing";
import type { AdminBillingUsageResponse } from "../../lib/api/billing-types";
import { PagePanel } from "../ui/page-panel";
import { StatusBadge } from "../ui/status-badge";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "결제 사용량 요청에 실패했습니다.";
}

function formatNumber(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}

function formatCost(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `$${value.toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ko-KR");
}

export function BillingOverview() {
  const [data, setData] = useState<AdminBillingUsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await getAdminBillingUsage();
        if (!mounted) return;
        setData(response);
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
  }, []);

  return (
    <div className="space-y-6">
      <PagePanel title="현재 요금제" description="결제 정보는 계약 기간 사용량과 요금제 한도를 기준으로 서버에서 계산됩니다.">
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {isLoading ? <p className="text-sm text-slate-500">결제 사용량을 불러오는 중...</p> : null}
        {!isLoading && data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">요금제</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{data.plan?.name ?? "활성 요금제 없음"}</p>
              <p className="mt-2 text-xs text-slate-500">{data.plan?.description ?? "계약 정보가 없으면 지원팀에 문의해 주세요."}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">결제 상태</p>
              <div className="mt-3">
                <StatusBadge tone={data.usage.isOverLimit ? "danger" : "success"}>
                  {data.billingStatus ?? (data.usage.isOverLimit ? "over_limit" : "active")}
                </StatusBadge>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">기간</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {formatDate(data.usage.periodStart)} - {formatDate(data.usage.periodEnd)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">예상 청구 금액</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatCost(data.usage.totalEstimatedCharge)}</p>
            </div>
          </div>
        ) : null}
      </PagePanel>

      {!isLoading && data ? (
        <>
          <PagePanel title="사용량 요약" description="토큰 사용량은 현재 결제 기간의 `llm_usage_logs`를 기준으로 집계됩니다. LLM이 실행되지 않은 fallback/일반 안내 대화는 총 토큰에 포함되지 않습니다.">
            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <p className="font-medium">토큰 집계 기준 안내</p>
              <p className="mt-1 leading-6 text-blue-800">
                총 토큰은 OpenAI 또는 Anthropic 호출이 실제로 실행된 대화의 `llm_usage_logs`만 합산합니다.
                근거 부족 fallback, 일반 안내, 인사 응답처럼 LLM을 호출하지 않은 대화는 토큰 사용량에서 제외됩니다.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">총 토큰</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(data.usage.totalTokens)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">남은 토큰</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(data.usage.remainingTokens)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">예상 초과 요금</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{formatCost(data.usage.estimatedOverageCost)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">초과 정책</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{data.usage.overagePolicy ?? "-"}</p>
              </div>
            </div>
          </PagePanel>

          <PagePanel title="한도 상태" description="사용량 기반 초과 요금이 활성화되어도 기존 하드 한도는 그대로 적용됩니다.">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-3">항목</th>
                    <th className="px-3 py-3">사용량</th>
                    <th className="px-3 py-3">한도</th>
                    <th className="px-3 py-3">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-3 py-4 text-slate-900">토큰</td>
                    <td className="px-3 py-4">{formatNumber(data.usage.totalTokens)}</td>
                    <td className="px-3 py-4">{formatNumber(data.usage.includedTokens)}</td>
                    <td className="px-3 py-4">
                      <StatusBadge tone={data.usage.isOverLimit ? "danger" : "success"}>
                        {data.usage.isOverLimit ? "over" : "normal"}
                      </StatusBadge>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-4 text-slate-900">월간 대화 수</td>
                    <td className="px-3 py-4">{formatNumber(data.monthlyConversationCount)}</td>
                    <td className="px-3 py-4">{formatNumber(data.monthlyConversationLimit)}</td>
                    <td className="px-3 py-4">
                      <StatusBadge tone={data.monthlyConversationLimit != null && data.monthlyConversationCount >= data.monthlyConversationLimit ? "warning" : "success"}>
                        {data.monthlyConversationLimit != null && data.monthlyConversationCount >= data.monthlyConversationLimit ? "limit_reached" : "normal"}
                      </StatusBadge>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-4 text-slate-900">활성 챗봇 수</td>
                    <td className="px-3 py-4">{formatNumber(data.activeChatbotCount)}</td>
                    <td className="px-3 py-4">{formatNumber(data.chatbotLimit)}</td>
                    <td className="px-3 py-4">
                      <StatusBadge tone={data.chatbotLimit != null && data.activeChatbotCount >= data.chatbotLimit ? "warning" : "success"}>
                        {data.chatbotLimit != null && data.activeChatbotCount >= data.chatbotLimit ? "limit_reached" : "normal"}
                      </StatusBadge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </PagePanel>
        </>
      ) : null}
    </div>
  );
}
