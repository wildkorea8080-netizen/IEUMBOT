"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  createSuperAdminContract,
  listSuperAdminOrgContracts,
  patchSuperAdminContract,
} from "../lib/api/super-admin-accounts-contracts";
import { listSuperAdminBillingPlans } from "../lib/api/super-admin-billing";
import type { BillingPlanItem } from "../lib/api/super-admin-billing-types";
import type {
  SuperAdminContractCreateRequest,
  SuperAdminContractItem,
  SuperAdminContractResponse,
  SuperAdminContractStatus,
} from "../lib/api/super-admin-accounts-contracts-types";
import { listSuperAdminOrganizations } from "../lib/api/super-admin-organizations";
import type { SuperAdminOrganizationListItem } from "../lib/api/super-admin-organizations-types";
import { AdminModal } from "./ui/admin-modal";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type ContractRow = SuperAdminContractItem & {
  organizationName: string;
};

type ContractFormState = {
  organizationId: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  monthlyConversationLimit: string;
  documentLimit: string;
  websiteLimit: string;
  chatbotLimit: string;
  widgetLimit: string;
  status: SuperAdminContractStatus;
};

const EMPTY_FORM: ContractFormState = {
  organizationId: "",
  planId: "",
  planName: "",
  startDate: "",
  endDate: "",
  monthlyConversationLimit: "",
  documentLimit: "",
  websiteLimit: "",
  chatbotLimit: "",
  widgetLimit: "",
  status: "active",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "계약 요청에 실패했습니다.";
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ko-KR");
}

function formatNumber(value?: number | null): string {
  if (value == null) return "-";
  return value.toLocaleString("ko-KR");
}

function toneForStatus(status: SuperAdminContractStatus): "success" | "warning" | "info" | "danger" {
  if (status === "active") return "success";
  if (status === "trial") return "info";
  if (status === "expired") return "danger";
  return "warning";
}

function toForm(row: ContractRow | null): ContractFormState {
  if (!row) return EMPTY_FORM;
  return {
    organizationId: row.organizationId,
    planId: row.planId ?? "",
    planName: row.planName,
    startDate: row.startDate,
    endDate: row.endDate ?? "",
    monthlyConversationLimit: row.monthlyConversationLimit != null ? String(row.monthlyConversationLimit) : "",
    documentLimit: row.documentLimit != null ? String(row.documentLimit) : "",
    websiteLimit: row.websiteLimit != null ? String(row.websiteLimit) : "",
    chatbotLimit: row.chatbotLimit != null ? String(row.chatbotLimit) : "",
    widgetLimit: row.widgetLimit != null ? String(row.widgetLimit) : "",
    status: row.status,
  };
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function toRequest(form: ContractFormState): SuperAdminContractCreateRequest {
  return {
    organizationId: form.organizationId,
    planId: form.planId.trim() || null,
    planName: form.planName.trim() || null,
    startDate: form.startDate,
    endDate: form.endDate.trim() || null,
    monthlyConversationLimit: toNullableNumber(form.monthlyConversationLimit),
    documentLimit: toNullableNumber(form.documentLimit),
    websiteLimit: toNullableNumber(form.websiteLimit),
    chatbotLimit: toNullableNumber(form.chatbotLimit),
    widgetLimit: toNullableNumber(form.widgetLimit),
    status: form.status,
  };
}

function isExpiringSoon(endDate?: string | null): boolean {
  if (!endDate) return false;
  const today = new Date();
  const target = new Date(endDate);
  if (Number.isNaN(target.getTime())) return false;
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 30;
}

export function SuperAdminContracts() {
  const [organizations, setOrganizations] = useState<SuperAdminOrganizationListItem[]>([]);
  const [plans, setPlans] = useState<BillingPlanItem[]>([]);
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SuperAdminContractStatus | "all">("all");
  const [expiryFilter, setExpiryFilter] = useState<"all" | "expiringSoon">("all");
  const [selectedRow, setSelectedRow] = useState<ContractRow | null>(null);
  const [form, setForm] = useState<ContractFormState>(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    setWarning(null);
    try {
      const orgResponse = await listSuperAdminOrganizations({ page: 1, pageSize: 100 });
      const planResponse = await listSuperAdminBillingPlans();
      setOrganizations(orgResponse.items);
      setPlans(planResponse.items.filter((item) => item.isActive));
      if (orgResponse.total > orgResponse.items.length) {
        setWarning(`MVP 제한으로 ${orgResponse.total}개 중 ${orgResponse.items.length}개 조직만 불러왔습니다.`);
      }

      const contractResponses = await Promise.all(
        orgResponse.items.map(async (org) => {
          const response = await listSuperAdminOrgContracts(org.id);
          return response.items.map((item) => ({
            ...item,
            organizationName: org.name,
          }));
        }),
      );

      setRows(
        contractResponses.flat().sort((a, b) => {
          const endA = a.endDate ?? a.startDate;
          const endB = b.endDate ?? b.startDate;
          return String(endB).localeCompare(String(endA));
        }),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setRows([]);
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
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !normalizedQuery ||
        row.organizationName.toLowerCase().includes(normalizedQuery) ||
        row.planName.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesExpiry = expiryFilter === "all" || isExpiringSoon(row.endDate);
      return matchesQuery && matchesStatus && matchesExpiry;
    });
  }, [rows, query, statusFilter, expiryFilter]);

  function openCreateModal() {
    setSelectedRow(null);
    setForm({
      ...EMPTY_FORM,
      organizationId: organizations[0]?.id ?? "",
      planId: plans[0]?.id ?? "",
      planName: plans[0]?.name ?? "",
      startDate: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  }

  function openEditModal(row: ContractRow) {
    setSelectedRow(row);
    setForm(toForm(row));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedRow(null);
    setForm(EMPTY_FORM);
  }

  async function saveContract() {
    if (!form.organizationId) {
      setError("조직을 선택해 주세요.");
      return;
    }
    if (!form.planName.trim()) {
      setError("요금제 이름은 필수입니다.");
      return;
    }
    if (!form.startDate) {
      setError("시작일은 필수입니다.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const body = toRequest(form);
      let saved: SuperAdminContractResponse;
      if (selectedRow) {
        saved = await patchSuperAdminContract(selectedRow.id, body);
      } else {
        saved = await createSuperAdminContract(body);
      }

      const organizationName =
        organizations.find((item) => item.id === saved.organizationId)?.name ?? selectedRow?.organizationName ?? "-";
      const nextRow: ContractRow = { ...saved, organizationName };

      setRows((current) => {
        if (selectedRow) {
          return current.map((item) => (item.id === selectedRow.id ? nextRow : item));
        }
        return [nextRow, ...current];
      });
      setMessage(selectedRow ? "계약이 수정되었습니다." : "계약이 생성되었습니다.");
      closeModal();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel title="계약 관리" description="조직 계약과 사용 한도를 조회하고 관리합니다.">
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {warning ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{warning}</p> : null}
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="기관 검색"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SuperAdminContractStatus | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성</option>
            <option value="trial">체험</option>
            <option value="suspended">정지</option>
            <option value="expired">만료</option>
          </select>
          <select
            value={expiryFilter}
            onChange={(event) => setExpiryFilter(event.target.value as "all" | "expiringSoon")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 만료 상태</option>
            <option value="expiringSoon">30일 이내 만료</option>
          </select>
          <button type="button" onClick={() => setQuery(queryInput)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
            검색
          </button>
          <button type="button" onClick={openCreateModal} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            계약 생성
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {isLoading ? "계약을 불러오는 중..." : `총 ${filteredRows.length}개 계약`}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[1380px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-3">기관</th>
                <th className="px-3 py-3">요금제</th>
                <th className="px-3 py-3">시작일</th>
                <th className="px-3 py-3">종료일</th>
                <th className="px-3 py-3">상태</th>
                <th className="px-3 py-3">월간 대화 수</th>
                <th className="px-3 py-3">문서</th>
                <th className="px-3 py-3">웹사이트</th>
                <th className="px-3 py-3">챗봇</th>
                <th className="px-3 py-3">위젯</th>
                <th className="px-3 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-slate-500">
                    계약이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-3 font-medium text-slate-900">{row.organizationName}</td>
                    <td className="px-3 py-3">{row.planName}</td>
                    <td className="px-3 py-3">{formatDate(row.startDate)}</td>
                    <td className="px-3 py-3">{formatDate(row.endDate)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={toneForStatus(row.status)}>{row.status}</StatusBadge>
                    </td>
                    <td className="px-3 py-3">{formatNumber(row.monthlyConversationLimit)}</td>
                    <td className="px-3 py-3">{formatNumber(row.documentLimit)}</td>
                    <td className="px-3 py-3">{formatNumber(row.websiteLimit)}</td>
                    <td className="px-3 py-3">{formatNumber(row.chatbotLimit)}</td>
                    <td className="px-3 py-3">{formatNumber(row.widgetLimit)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openEditModal(row)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700">
                          수정
                        </button>
                        <Link href="/super-admin/organizations" className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700">
                          기관 관리
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <AdminModal
        open={modalOpen}
        title={selectedRow ? "계약 수정" : "계약 생성"}
        description="계약 기간, 요금제, 사용 한도를 관리합니다."
        onClose={closeModal}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">기관</span>
            <select
              value={form.organizationId}
              onChange={(event) => setForm((current) => ({ ...current, organizationId: event.target.value }))}
              disabled={Boolean(selectedRow)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
            >
              <option value="">기관 선택</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">요금제</span>
            <select
              value={form.planId}
              onChange={(event) => {
                const nextPlanId = event.target.value;
                const selectedPlan = plans.find((item) => item.id === nextPlanId);
                setForm((current) => ({
                  ...current,
                  planId: nextPlanId,
                  planName: selectedPlan?.name ?? current.planName,
                  monthlyConversationLimit:
                    selectedPlan?.monthlyConversationLimit != null
                      ? String(selectedPlan.monthlyConversationLimit)
                      : current.monthlyConversationLimit,
                  chatbotLimit:
                    selectedPlan?.chatbotLimit != null ? String(selectedPlan.chatbotLimit) : current.chatbotLimit,
                }));
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">사용자 지정 / 레거시 요금제</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">요금제명</span>
            <input value={form.planName} onChange={(event) => setForm((current) => ({ ...current, planName: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">상태</span>
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SuperAdminContractStatus }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="active">활성</option>
              <option value="trial">체험</option>
              <option value="suspended">정지</option>
              <option value="expired">만료</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">시작일</span>
            <input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">종료일</span>
            <input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">월간 대화 수</span>
            <input type="number" min="0" value={form.monthlyConversationLimit} onChange={(event) => setForm((current) => ({ ...current, monthlyConversationLimit: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">문서 한도</span>
            <input type="number" min="0" value={form.documentLimit} onChange={(event) => setForm((current) => ({ ...current, documentLimit: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">웹사이트 한도</span>
            <input type="number" min="0" value={form.websiteLimit} onChange={(event) => setForm((current) => ({ ...current, websiteLimit: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">챗봇 한도</span>
            <input type="number" min="0" value={form.chatbotLimit} onChange={(event) => setForm((current) => ({ ...current, chatbotLimit: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">위젯 한도</span>
            <input type="number" min="0" value={form.widgetLimit} onChange={(event) => setForm((current) => ({ ...current, widgetLimit: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
            취소
          </button>
          <button type="button" onClick={() => void saveContract()} disabled={isSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </AdminModal>
    </div>
  );
}
