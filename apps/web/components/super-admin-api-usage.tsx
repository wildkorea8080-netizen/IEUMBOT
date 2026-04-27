"use client";

import { useEffect, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  getSuperAdminApiUsageByChatbot,
  getSuperAdminApiUsageByOrganization,
  getSuperAdminApiUsageErrors,
  getSuperAdminApiUsageSummary,
} from "../lib/api/super-admin-api";
import type {
  SuperAdminApiUsageByChatbotItem,
  SuperAdminApiUsageByOrganizationItem,
  SuperAdminApiUsageErrorItem,
  SuperAdminApiUsageSummary,
} from "../lib/api/super-admin-api-types";
import { PagePanel } from "./ui/page-panel";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "API 사용량 요청에 실패했습니다.";
}

function formatNumber(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}

function formatCost(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `$${value.toFixed(4)}`;
}

export function SuperAdminApiUsage() {
  const [summary, setSummary] = useState<SuperAdminApiUsageSummary | null>(null);
  const [organizations, setOrganizations] = useState<SuperAdminApiUsageByOrganizationItem[]>([]);
  const [chatbots, setChatbots] = useState<SuperAdminApiUsageByChatbotItem[]>([]);
  const [errors, setErrors] = useState<SuperAdminApiUsageErrorItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [summaryResponse, organizationResponse, chatbotResponse, errorResponse] = await Promise.all([
          getSuperAdminApiUsageSummary(),
          getSuperAdminApiUsageByOrganization(),
          getSuperAdminApiUsageByChatbot(),
          getSuperAdminApiUsageErrors(),
        ]);
        if (!mounted) return;
        setSummary(summaryResponse);
        setOrganizations(organizationResponse.items);
        setChatbots(chatbotResponse.items);
        setErrors(errorResponse.items);
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
      <PagePanel title="API 사용량 개요" description="조직과 챗봇 전반의 공용 LLM 사용량, 비용, 오류 추이를 확인합니다.">
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {isLoading ? <p className="text-sm text-slate-500">API 사용량을 불러오는 중...</p> : null}
        {!isLoading && summary ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">총 호출 수</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(summary.totalCalls)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">총 토큰 수</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(summary.totalTokens)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">예상 비용</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatCost(summary.estimatedCost)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">실패율</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{summary.failureRate.toFixed(2)}%</p>
            </div>
          </div>
        ) : null}
      </PagePanel>

      <PagePanel title="기관별 사용량" description="사용량은 organizationId 기준으로 그룹화되며 `llm_usage_logs`에서 집계됩니다.">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">기관</th>
                <th className="px-3 py-3">호출 수</th>
                <th className="px-3 py-3">토큰 수</th>
                <th className="px-3 py-3">비용</th>
                <th className="px-3 py-3">실패율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {organizations.map((item) => (
                <tr key={item.organizationId}>
                  <td className="px-3 py-4 text-slate-900">{item.organizationName}</td>
                  <td className="px-3 py-4">{formatNumber(item.totalCalls)}</td>
                  <td className="px-3 py-4">{formatNumber(item.totalTokens)}</td>
                  <td className="px-3 py-4">{formatCost(item.estimatedCost)}</td>
                  <td className="px-3 py-4">{item.failureRate.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <PagePanel title="챗봇별 사용량" description="사용량은 chatbotId 기준으로 그룹화되어 고객별 사용량을 분리해 보여줍니다.">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">챗봇</th>
                <th className="px-3 py-3">기관 ID</th>
                <th className="px-3 py-3">호출 수</th>
                <th className="px-3 py-3">토큰 수</th>
                <th className="px-3 py-3">비용</th>
                <th className="px-3 py-3">실패율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chatbots.map((item) => (
                <tr key={item.chatbotId}>
                  <td className="px-3 py-4 text-slate-900">{item.chatbotName}</td>
                  <td className="px-3 py-4 text-xs text-slate-500">{item.organizationId}</td>
                  <td className="px-3 py-4">{formatNumber(item.totalCalls)}</td>
                  <td className="px-3 py-4">{formatNumber(item.totalTokens)}</td>
                  <td className="px-3 py-4">{formatCost(item.estimatedCost)}</td>
                  <td className="px-3 py-4">{item.failureRate.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <PagePanel title="최근 API 오류" description="최근 실패한 LLM 호출만 표시합니다. Raw key는 저장하거나 노출하지 않습니다.">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">시간</th>
                <th className="px-3 py-3">기관</th>
                <th className="px-3 py-3">챗봇</th>
                <th className="px-3 py-3">Provider</th>
                <th className="px-3 py-3">모델</th>
                <th className="px-3 py-3">작업</th>
                <th className="px-3 py-3">오류</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {errors.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-4">{new Date(item.createdAt).toLocaleString("ko-KR")}</td>
                  <td className="px-3 py-4">{item.organizationName}</td>
                  <td className="px-3 py-4">{item.chatbotName}</td>
                  <td className="px-3 py-4">{item.provider}</td>
                  <td className="px-3 py-4">{item.model ?? "-"}</td>
                  <td className="px-3 py-4">{item.operationType}</td>
                  <td className="px-3 py-4 text-rose-700">{item.errorCode ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PagePanel>
    </div>
  );
}
