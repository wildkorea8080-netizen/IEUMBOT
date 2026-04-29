"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  createSuperAdminBillingPlan,
  getSuperAdminBillingAlerts,
  getSuperAdminBillingByOrganization,
  getSuperAdminBillingSummary,
  listSuperAdminBillingPlans,
  patchSuperAdminBillingPlan,
} from "../lib/api/super-admin-billing";
import type {
  BillingAlertItem,
  BillingPlanItem,
  BillingPlanUpsertRequest,
  BillingSummaryItem,
  SuperAdminBillingSummary,
} from "../lib/api/super-admin-billing-types";
import { AdminModal } from "./ui/admin-modal";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type PlanFormState = {
  name: string;
  description: string;
  monthlyBaseFee: string;
  includedTokens: string;
  pricePer1kTokens: string;
  chatbotLimit: string;
  monthlyConversationLimit: string;
  overagePolicy: "block" | "allow_with_charge";
  isActive: boolean;
};

const EMPTY_FORM: PlanFormState = {
  name: "",
  description: "",
  monthlyBaseFee: "0",
  includedTokens: "0",
  pricePer1kTokens: "0",
  chatbotLimit: "",
  monthlyConversationLimit: "",
  overagePolicy: "block",
  isActive: true,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "결제 요청에 실패했습니다.";
}

function formatNumber(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}

function formatCost(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `$${value.toFixed(2)}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPlanForm(plan: BillingPlanItem | null): PlanFormState {
  if (!plan) return EMPTY_FORM;
  return {
    name: plan.name,
    description: plan.description ?? "",
    monthlyBaseFee: String(plan.monthlyBaseFee),
    includedTokens: String(plan.includedTokens),
    pricePer1kTokens: String(plan.pricePer1kTokens),
    chatbotLimit: plan.chatbotLimit != null ? String(plan.chatbotLimit) : "",
    monthlyConversationLimit:
      plan.monthlyConversationLimit != null ? String(plan.monthlyConversationLimit) : "",
    overagePolicy: plan.overagePolicy,
    isActive: plan.isActive,
  };
}

function toPlanRequest(form: PlanFormState): BillingPlanUpsertRequest {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    monthlyBaseFee: Number(form.monthlyBaseFee || 0),
    includedTokens: Number(form.includedTokens || 0),
    pricePer1kTokens: Number(form.pricePer1kTokens || 0),
    chatbotLimit: toNullableNumber(form.chatbotLimit),
    monthlyConversationLimit: toNullableNumber(form.monthlyConversationLimit),
    overagePolicy: form.overagePolicy,
    isActive: form.isActive,
  };
}

function alertTone(level: string): "danger" | "warning" | "info" {
  if (level === "critical" || level === "alert") return "danger";
  if (level === "warning") return "warning";
  return "info";
}

export function SuperAdminBilling() {
  const [summary, setSummary] = useState<SuperAdminBillingSummary | null>(null);
  const [plans, setPlans] = useState<BillingPlanItem[]>([]);
  const [organizations, setOrganizations] = useState<BillingSummaryItem[]>([]);
  const [alerts, setAlerts] = useState<BillingAlertItem[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "over" | "normal">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<BillingPlanItem | null>(null);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryResponse, planResponse, organizationResponse, alertResponse] = await Promise.all([
        getSuperAdminBillingSummary(),
        listSuperAdminBillingPlans(),
        getSuperAdminBillingByOrganization(),
        getSuperAdminBillingAlerts(),
      ]);
      setSummary(summaryResponse);
      setPlans(planResponse.items);
      setOrganizations(organizationResponse.items);
      setAlerts(alertResponse.items);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  const filteredOrganizations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return organizations.filter((item) => {
      const matchesQuery =
        !normalized ||
        item.organizationName.toLowerCase().includes(normalized) ||
        (item.planName ?? "").toLowerCase().includes(normalized);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "over" ? item.isOverLimit : !item.isOverLimit);
      return matchesQuery && matchesStatus;
    });
  }, [organizations, query, statusFilter]);

  function openCreateModal() {
    setEditingPlan(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEditModal(plan: BillingPlanItem) {
    setEditingPlan(plan);
    setForm(toPlanForm(plan));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingPlan(null);
    setForm(EMPTY_FORM);
  }

  async function savePlan() {
    if (!form.name.trim()) {
      setError("요금제 이름은 필수입니다.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const body = toPlanRequest(form);
      const saved = editingPlan
        ? await patchSuperAdminBillingPlan(editingPlan.id, body)
        : await createSuperAdminBillingPlan(body);
      setPlans((current) => {
        if (editingPlan) {
          return current.map((item) => (item.id === editingPlan.id ? saved : item));
        }
        return [saved, ...current];
      });
      setMessage(editingPlan ? "요금제가 수정되었습니다." : "요금제가 생성되었습니다.");
      closeModal();
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel title="결제 개요" description="조직별 예상 매출, 초과 사용 요금, 요금제 설정을 확인합니다.">
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {isLoading ? <p className="text-sm text-slate-500">결제 요약을 불러오는 중...</p> : null}
        {!isLoading && summary ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">예상 매출</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatCost(summary.totalMonthlyRevenueEstimate)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">초과 요금 예상액</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatCost(summary.totalOverageEstimate)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">한도 초과 조직 수</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(summary.overLimitOrganizationCount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">활성 계약 수</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber(summary.activeContractCount)}</p>
            </div>
          </div>
        ) : null}
      </PagePanel>

      <PagePanel title="요금제 목록" description="요금제별 포함 토큰, 초과 과금 정책, 계약에 적용되는 사용 한도를 관리합니다.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{isLoading ? "요금제를 불러오는 중..." : `총 ${plans.length}개 요금제`}</p>
          <button type="button" onClick={openCreateModal} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            새 요금제
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">이름</th>
                <th className="px-3 py-3">기본 요금</th>
                <th className="px-3 py-3">포함 토큰</th>
                <th className="px-3 py-3">1K당 요금</th>
                <th className="px-3 py-3">대화 한도</th>
                <th className="px-3 py-3">챗봇 한도</th>
                <th className="px-3 py-3">초과 정책</th>
                <th className="px-3 py-3">상태</th>
                <th className="px-3 py-3">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    등록된 요금제가 없습니다.
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id}>
                    <td className="px-3 py-4">
                      <p className="font-medium text-slate-900">{plan.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{plan.description ?? "-"}</p>
                    </td>
                    <td className="px-3 py-4">{formatCost(plan.monthlyBaseFee)}</td>
                    <td className="px-3 py-4">{formatNumber(plan.includedTokens)}</td>
                    <td className="px-3 py-4">{formatCost(plan.pricePer1kTokens)}</td>
                    <td className="px-3 py-4">{formatNumber(plan.monthlyConversationLimit)}</td>
                    <td className="px-3 py-4">{formatNumber(plan.chatbotLimit)}</td>
                    <td className="px-3 py-4">{plan.overagePolicy}</td>
                    <td className="px-3 py-4">
                      <StatusBadge tone={plan.isActive ? "success" : "warning"}>{plan.isActive ? "활성" : "비활성"}</StatusBadge>
                    </td>
                    <td className="px-3 py-4">
                      <button type="button" onClick={() => openEditModal(plan)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700">
                        수정
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <PagePanel title="조직별 결제" description="계약 기간 사용량과 요금제 초과 과금 설정을 기준으로 조직별 예상 청구액을 확인합니다.">
        <div className="flex flex-wrap gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="조직명 또는 요금제 검색"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "over" | "normal")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 조직</option>
            <option value="over">한도 초과</option>
            <option value="normal">한도 이내</option>
          </select>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">조직</th>
                <th className="px-3 py-3">요금제</th>
                <th className="px-3 py-3">토큰</th>
                <th className="px-3 py-3">잔여량</th>
                <th className="px-3 py-3">예상 초과 요금</th>
                <th className="px-3 py-3">총 예상 청구액</th>
                <th className="px-3 py-3">대화 수</th>
                <th className="px-3 py-3">챗봇 수</th>
                <th className="px-3 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!isLoading && filteredOrganizations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    표시할 결제 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredOrganizations.map((item) => (
                  <tr key={`${item.organizationId}-${item.contractId ?? "none"}`}>
                    <td className="px-3 py-4 font-medium text-slate-900">{item.organizationName}</td>
                    <td className="px-3 py-4">{item.planName ?? "-"}</td>
                    <td className="px-3 py-4">{formatNumber(item.totalTokens)}</td>
                    <td className="px-3 py-4">{formatNumber(item.remainingTokens)}</td>
                    <td className="px-3 py-4">{formatCost(item.estimatedOverageCost)}</td>
                    <td className="px-3 py-4">{formatCost(item.totalEstimatedCharge)}</td>
                    <td className="px-3 py-4">
                      {formatNumber(item.monthlyConversationCount)}
                      {item.monthlyConversationLimit != null ? ` / ${formatNumber(item.monthlyConversationLimit)}` : ""}
                    </td>
                    <td className="px-3 py-4">
                      {formatNumber(item.activeChatbotCount)}
                      {item.chatbotLimit != null ? ` / ${formatNumber(item.chatbotLimit)}` : ""}
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge tone={item.isOverLimit ? "danger" : "success"}>
                        {item.isOverLimit ? "초과" : item.billingStatus ?? "활성"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <PagePanel title="결제 알림" description="임계치 알림을 저장하고, 이후 Slack 또는 웹훅 전송으로 확장할 수 있습니다.">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">시간</th>
                <th className="px-3 py-3">조직</th>
                <th className="px-3 py-3">지표</th>
                <th className="px-3 py-3">등급</th>
                <th className="px-3 py-3">메시지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alerts.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                    아직 결제 알림이 없습니다.
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => {
                  const orgName =
                    organizations.find((item) => item.organizationId === alert.organizationId)?.organizationName ??
                    alert.organizationId;
                  return (
                    <tr key={alert.id}>
                      <td className="px-3 py-4">{formatDateTime(alert.createdAt)}</td>
                      <td className="px-3 py-4">{orgName}</td>
                      <td className="px-3 py-4">{alert.metricKey}</td>
                      <td className="px-3 py-4">
                        <StatusBadge tone={alertTone(alert.level)}>{alert.level}</StatusBadge>
                      </td>
                      <td className="px-3 py-4 text-slate-700">{alert.message}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <AdminModal
        open={modalOpen}
        title={editingPlan ? "요금제 수정" : "요금제 생성"}
        description="요금제별 포함 토큰, 초과 과금, 하드 사용 한도를 설정합니다."
        onClose={closeModal}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">이름</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">설명</span>
            <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="min-h-[88px] w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">월 기본 요금</span>
            <input type="number" min="0" step="0.01" value={form.monthlyBaseFee} onChange={(event) => setForm((current) => ({ ...current, monthlyBaseFee: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">포함 토큰</span>
            <input type="number" min="0" value={form.includedTokens} onChange={(event) => setForm((current) => ({ ...current, includedTokens: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">1K 토큰당 요금</span>
            <input type="number" min="0" step="0.0001" value={form.pricePer1kTokens} onChange={(event) => setForm((current) => ({ ...current, pricePer1kTokens: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">초과 정책</span>
            <select value={form.overagePolicy} onChange={(event) => setForm((current) => ({ ...current, overagePolicy: event.target.value as "block" | "allow_with_charge" }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="block">차단</option>
              <option value="allow_with_charge">과금 후 허용</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">챗봇 한도</span>
            <input type="number" min="0" value={form.chatbotLimit} onChange={(event) => setForm((current) => ({ ...current, chatbotLimit: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">월 대화 한도</span>
            <input type="number" min="0" value={form.monthlyConversationLimit} onChange={(event) => setForm((current) => ({ ...current, monthlyConversationLimit: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
            <span>활성</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
            취소
          </button>
          <button type="button" onClick={() => void savePlan()} disabled={isSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </AdminModal>
    </div>
  );
}
