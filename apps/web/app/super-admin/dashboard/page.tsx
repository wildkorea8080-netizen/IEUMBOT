"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "../../../components/ui/empty-state";
import { AdminIcon } from "../../../components/ui/admin-icons";
import { PageHeader } from "../../../components/ui/page-header";
import { SectionCard } from "../../../components/ui/section-card";
import { StatCard } from "../../../components/ui/stat-card";
import { StatusBadge } from "../../../components/ui/status-badge";
import { getSuperAdminBillingAlerts, getSuperAdminBillingByOrganization, getSuperAdminBillingSummary } from "../../../lib/api/super-admin-billing";
import type { BillingAlertItem, BillingSummaryItem, SuperAdminBillingSummary } from "../../../lib/api/super-admin-billing-types";
import { listAllSuperAdminChatbots } from "../../../lib/api/super-admin-chatbots";
import { listSuperAdminOrgContracts } from "../../../lib/api/super-admin-accounts-contracts";
import { listSuperAdminOrganizations } from "../../../lib/api/super-admin-organizations";
import type { SuperAdminOrganizationListItem } from "../../../lib/api/super-admin-organizations-types";
import { listSuperAdminWidgets } from "../../../lib/api/super-admin-widgets";
import { ApiClientError } from "../../../lib/api";

type PlanDistributionRow = {
  label: string;
  count: number;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "슈퍼관리자 대시보드 데이터를 불러오지 못했습니다.";
}

function formatCurrency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `$${value.toFixed(2)}`;
}

function formatNumber(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}

function alertTone(level: string): "danger" | "warning" | "info" {
  if (level === "critical" || level === "alert") return "danger";
  if (level === "warning") return "warning";
  return "info";
}

function statusTone(status?: string | null): "success" | "warning" | "danger" | "info" {
  if (status === "active") return "success";
  if (status === "trial") return "info";
  if (status === "expired") return "danger";
  return "warning";
}

function SimpleBarChart({ rows }: { rows: PlanDistributionRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="요금제 데이터가 없습니다" description="계약과 요금제가 연결되면 분포를 표시합니다." icon="billing" />;
  }

  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
            <span>{row.label}</span>
            <span className="font-medium text-slate-900">{row.count}개</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full bg-indigo-500"
              style={{ width: `${Math.max(10, Math.round((row.count / maxCount) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SuperAdminDashboardPage() {
  const [organizations, setOrganizations] = useState<SuperAdminOrganizationListItem[]>([]);
  const [billingSummary, setBillingSummary] = useState<SuperAdminBillingSummary | null>(null);
  const [billingByOrganization, setBillingByOrganization] = useState<BillingSummaryItem[]>([]);
  const [alerts, setAlerts] = useState<BillingAlertItem[]>([]);
  const [totalWidgets, setTotalWidgets] = useState(0);
  const [totalChatbots, setTotalChatbots] = useState(0);
  const [activeContractCount, setActiveContractCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [orgRes, billingSummaryRes, billingOrgRes, alertsRes, widgetRes, chatbotRes] = await Promise.all([
          listSuperAdminOrganizations({ page: 1, pageSize: 100 }),
          getSuperAdminBillingSummary(),
          getSuperAdminBillingByOrganization(),
          getSuperAdminBillingAlerts(),
          listSuperAdminWidgets(),
          listAllSuperAdminChatbots(),
        ]);

        const contractResponses = await Promise.all(
          orgRes.items.map(async (org) => {
            const response = await listSuperAdminOrgContracts(org.id);
            return response.items;
          }),
        );

        if (!mounted) return;

        const allContracts = contractResponses.flat();
        setOrganizations(orgRes.items);
        setBillingSummary(billingSummaryRes);
        setBillingByOrganization(billingOrgRes.items);
        setAlerts(alertsRes.items);
        setTotalWidgets(widgetRes.items.length);
        setTotalChatbots(chatbotRes.items.length);
        setActiveContractCount(allContracts.filter((contract) => contract.status === "active").length);
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
  }, []);

  const usageTopRows = useMemo(
    () =>
      [...billingByOrganization]
        .sort((a, b) => b.totalTokens - a.totalTokens)
        .slice(0, 5),
    [billingByOrganization],
  );

  const planDistribution = useMemo(() => {
    const map = new Map<string, number>();
    billingByOrganization.forEach((item) => {
      const key = item.planName ?? "미지정";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
  }, [billingByOrganization]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="슈퍼관리자 대시보드"
        description="전체 기관 운영 상태, 계약 현황, 예상 매출, 사용량 상위를 하나의 시야에서 확인할 수 있도록 구성했습니다."
        breadcrumbs={["슈퍼관리자", "대시보드"]}
        badge={
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            CONTROL TOWER
          </span>
        }
        actions={
          <>
            <Link
              href="/super-admin/usage"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <AdminIcon name="refresh" className="h-4 w-4" />
              사용량 보기
            </Link>
            <Link
              href="/super-admin/organizations"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white"
            >
              <AdminIcon name="plus" className="h-4 w-4" />
              조직 관리
            </Link>
          </>
        }
      />

      {error ? (
        <SectionCard title="데이터 로드 오류" description="관리 API 응답을 확인한 뒤 다시 시도해 주세요.">
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        </SectionCard>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="전체 기관 수" value={organizations.length} icon="organization" />
        <StatCard label="활성 계약 수" value={activeContractCount} icon="contract" tone="success" />
        <StatCard
          label="월간 예상 매출"
          value={formatCurrency(billingSummary?.totalMonthlyRevenueEstimate)}
          hint={
            billingSummary
              ? `초과 과금 예상 ${formatCurrency(billingSummary.totalOverageEstimate)}`
              : undefined
          }
          icon="billing"
        />
        <StatCard
          label="전체 API 사용량"
          value={formatNumber(billingByOrganization.reduce((sum, item) => sum + item.totalTokens, 0))}
          hint={`챗봇 ${totalChatbots}개 / 위젯 ${totalWidgets}개`}
          icon="usage"
          tone="neutral"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <SectionCard title="기관별 사용량 TOP" description="토큰 사용량 기준 상위 기관을 우선 표시합니다.">
          {isLoading ? (
            <p className="text-sm text-slate-500">기관별 사용량을 집계하는 중입니다...</p>
          ) : usageTopRows.length === 0 ? (
            <EmptyState title="사용량 데이터가 없습니다" description="조직별 사용량이 집계되면 상위 목록을 표시합니다." icon="usage" />
          ) : (
            <div className="space-y-3">
              {usageTopRows.map((item, index) => (
                <div
                  key={`${item.organizationId}-${item.contractId ?? "none"}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <p className="truncate text-sm font-semibold text-slate-900">{item.organizationName}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{item.planName ?? "요금제 미지정"}</span>
                      <StatusBadge tone={item.isOverLimit ? "danger" : "success"}>
                        {item.isOverLimit ? "한도 초과" : item.billingStatus ?? "정상"}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">{formatNumber(item.totalTokens)}</p>
                    <p className="mt-1 text-xs text-slate-500">예상 청구 {formatCurrency(item.totalEstimatedCharge)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="요금제 분포" description="현재 계약된 조직 수 기준 분포입니다.">
          {isLoading ? (
            <p className="text-sm text-slate-500">요금제 분포를 집계하는 중입니다...</p>
          ) : (
            <SimpleBarChart rows={planDistribution} />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="최근 청구 및 운영 알림" description="과금, 한도 초과, 경고 이벤트를 우선 노출합니다.">
          {alerts.length === 0 ? (
            <EmptyState title="알림이 없습니다" description="현재 청구 또는 운영상 주의가 필요한 알림이 없습니다." icon="notification" />
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 6).map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{alert.metricKey}</p>
                        <StatusBadge tone={alertTone(alert.level)}>{alert.level}</StatusBadge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{alert.message}</p>
                    </div>
                    <p className="text-xs text-slate-500">{new Date(alert.createdAt).toLocaleString("ko-KR")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="기관 상태 요약" description="조직별 활성 상태와 계약 상태를 빠르게 확인할 수 있는 운영 요약입니다.">
          {organizations.length === 0 ? (
            <EmptyState title="조직 데이터가 없습니다" description="등록된 조직이 생기면 상태 요약을 표시합니다." icon="organization" />
          ) : (
            <div className="space-y-3">
              {organizations.slice(0, 6).map((org) => (
                <div key={org.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{org.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        코드 {org.code} · 챗봇 {org.chatbotCount}개
                      </p>
                    </div>
                    <StatusBadge tone={statusTone(org.status)}>{org.status}</StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
