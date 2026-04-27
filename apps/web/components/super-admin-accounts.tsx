"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  createSuperAdminOrgAdmin,
  disableSuperAdminAdmin,
  listSuperAdminOrgAdmins,
  patchSuperAdminAdmin,
  resetSuperAdminAdminPassword,
} from "../lib/api/super-admin-accounts-contracts";
import type {
  SuperAdminAdminStatus,
  SuperAdminOrgAdminCreateRequest,
  SuperAdminOrgAdminItem,
  SuperAdminOrgAdminResponse,
} from "../lib/api/super-admin-accounts-contracts-types";
import { listSuperAdminOrganizations } from "../lib/api/super-admin-organizations";
import type { SuperAdminOrganizationListItem } from "../lib/api/super-admin-organizations-types";
import { AdminModal } from "./ui/admin-modal";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type AccountRow = SuperAdminOrgAdminItem & {
  organizationName: string;
};

type AccountFormState = {
  organizationId: string;
  name: string;
  email: string;
  temporaryPassword: string;
  status: SuperAdminAdminStatus;
};

type ResetPasswordState = {
  adminId: string;
  temporaryPassword: string;
  adminName: string;
};

const EMPTY_FORM: AccountFormState = {
  organizationId: "",
  name: "",
  email: "",
  temporaryPassword: "",
  status: "active",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "관리자 계정 요청에 실패했습니다.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function toneForStatus(status: SuperAdminAdminStatus): "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "inactive") return "warning";
  return "danger";
}

function toCreateRequest(form: AccountFormState): SuperAdminOrgAdminCreateRequest {
  return {
    email: form.email.trim(),
    name: form.name.trim(),
    temporaryPassword: form.temporaryPassword,
    status: form.status,
  };
}

export function SuperAdminAccounts() {
  const [organizations, setOrganizations] = useState<SuperAdminOrganizationListItem[]>([]);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SuperAdminAdminStatus | "all">("all");
  const [selectedRow, setSelectedRow] = useState<AccountRow | null>(null);
  const [form, setForm] = useState<AccountFormState>(EMPTY_FORM);
  const [resetState, setResetState] = useState<ResetPasswordState | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
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
      setOrganizations(orgResponse.items);
      if (orgResponse.total > orgResponse.items.length) {
        setWarning(`MVP 제한으로 ${orgResponse.total}개 중 ${orgResponse.items.length}개 조직만 불러왔습니다.`);
      }

      const adminResponses = await Promise.all(
        orgResponse.items.map(async (org) => {
          const response = await listSuperAdminOrgAdmins(org.id);
          return response.items.map((item) => ({
            ...item,
            organizationName: org.name,
          }));
        }),
      );
      setRows(adminResponses.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
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
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery) ||
        row.organizationName.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  function openCreateModal() {
    setSelectedRow(null);
    setForm({
      ...EMPTY_FORM,
      organizationId: organizations[0]?.id ?? "",
    });
    setEditorOpen(true);
  }

  function openEditModal(row: AccountRow) {
    setSelectedRow(row);
    setForm({
      organizationId: row.organizationId ?? "",
      name: row.name,
      email: row.email,
      temporaryPassword: "",
      status: row.status,
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setSelectedRow(null);
    setForm(EMPTY_FORM);
  }

  function openResetModal(row: AccountRow) {
    setResetState({ adminId: row.id, temporaryPassword: "", adminName: row.name });
    setResetOpen(true);
  }

  function closeResetModal() {
    setResetOpen(false);
    setResetState(null);
  }

  async function saveAccount() {
    if (!form.organizationId) {
      setError("조직을 선택해 주세요.");
      return;
    }
    if (!form.name.trim() || !form.email.trim()) {
      setError("이름과 이메일은 필수입니다.");
      return;
    }
    if (!selectedRow && form.temporaryPassword.length < 8) {
      setError("임시 비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      let saved: SuperAdminOrgAdminResponse;
      if (selectedRow) {
        saved = await patchSuperAdminAdmin(selectedRow.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          status: form.status,
        });
      } else {
        saved = await createSuperAdminOrgAdmin(form.organizationId, toCreateRequest(form));
      }

      const organizationName =
        organizations.find((item) => item.id === saved.organizationId)?.name ?? selectedRow?.organizationName ?? "-";
      const nextRow: AccountRow = { ...saved, organizationName };

      setRows((current) => {
        if (selectedRow) {
          return current.map((item) => (item.id === selectedRow.id ? nextRow : item));
        }
        return [nextRow, ...current];
      });
      setMessage(selectedRow ? "계정이 수정되었습니다." : "계정이 생성되었습니다.");
      closeEditor();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function resetPassword() {
    if (!resetState) return;
    if (resetState.temporaryPassword.length < 8) {
      setError("임시 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!window.confirm("이 비밀번호를 초기화하시겠습니까?")) return;

    setIsSaving(true);
    setError(null);
    try {
      await resetSuperAdminAdminPassword(resetState.adminId, {
        temporaryPassword: resetState.temporaryPassword,
      });
      setMessage("비밀번호 초기화가 완료되었습니다.");
      closeResetModal();
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setIsSaving(false);
    }
  }

  async function disableAccount(row: AccountRow) {
    if (!window.confirm(`${row.name} 계정을 비활성화하시겠습니까?`)) return;
    try {
      const response = await disableSuperAdminAdmin(row.id);
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, status: response.status, email: response.email, name: response.name } : item,
        ),
      );
      setMessage("계정이 비활성화되었습니다.");
    } catch (disableError) {
      setError(getErrorMessage(disableError));
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel title="계정 관리" description="기관 관리자 계정을 조회하고 관리합니다.">
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {warning ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{warning}</p> : null}
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="기관 또는 이메일 검색"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SuperAdminAdminStatus | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
            <option value="disabled">비활성화됨</option>
          </select>
          <button type="button" onClick={() => setQuery(queryInput)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
            검색
          </button>
          <button type="button" onClick={openCreateModal} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            계정 생성
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {isLoading ? "계정을 불러오는 중..." : `총 ${filteredRows.length}개 계정`}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-3">이름</th>
                <th className="px-3 py-3">이메일</th>
                <th className="px-3 py-3">역할</th>
                <th className="px-3 py-3">기관</th>
                <th className="px-3 py-3">상태</th>
                <th className="px-3 py-3">마지막 로그인</th>
                <th className="px-3 py-3">생성일</th>
                <th className="px-3 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    계정이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-3 py-3">{row.email}</td>
                    <td className="px-3 py-3">{row.role}</td>
                    <td className="px-3 py-3">{row.organizationName}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={toneForStatus(row.status)}>{row.status}</StatusBadge>
                    </td>
                    <td className="px-3 py-3">{formatDateTime(row.lastLoginAt)}</td>
                    <td className="px-3 py-3">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openEditModal(row)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700">
                          수정
                        </button>
                        <button type="button" onClick={() => openResetModal(row)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700">
                          비밀번호 초기화
                        </button>
                        <button type="button" onClick={() => void disableAccount(row)} className="rounded-lg border border-rose-300 px-3 py-2 text-xs text-rose-700">
                          비활성화
                        </button>
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
        open={editorOpen}
        title={selectedRow ? "계정 수정" : "계정 생성"}
        description="기관 관리자 계정을 생성하거나 수정합니다."
        onClose={closeEditor}
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
            <span className="mb-1 block font-medium">이름</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">이메일</span>
            <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          {!selectedRow ? (
            <label className="text-sm text-slate-700 md:col-span-2">
              <span className="mb-1 block font-medium">임시 비밀번호</span>
              <input type="password" value={form.temporaryPassword} onChange={(event) => setForm((current) => ({ ...current, temporaryPassword: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          ) : null}
          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">상태</span>
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SuperAdminAdminStatus }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
              <option value="disabled">비활성화됨</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={closeEditor} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
            취소
          </button>
          <button type="button" onClick={() => void saveAccount()} disabled={isSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </AdminModal>

      <AdminModal
        open={resetOpen}
        title="비밀번호 초기화"
        description={resetState ? `${resetState.adminName} 계정의 새 임시 비밀번호를 설정합니다.` : undefined}
        onClose={closeResetModal}
      >
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">임시 비밀번호</span>
          <input
            type="password"
            value={resetState?.temporaryPassword ?? ""}
            onChange={(event) =>
              setResetState((current) => (current ? { ...current, temporaryPassword: event.target.value } : current))
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={closeResetModal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
            취소
          </button>
          <button type="button" onClick={() => void resetPassword()} disabled={isSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {isSaving ? "처리 중..." : "초기화"}
          </button>
        </div>
      </AdminModal>
    </div>
  );
}
