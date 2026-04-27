"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../../lib/api";
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  patchAdminUser,
} from "../../lib/api/admin-users";
import type {
  AdminUserCreateRequest,
  AdminUserItem,
  AdminUserRole,
  AdminUserStatus,
} from "../../lib/api/admin-users-types";
import { AdminModal } from "../ui/admin-modal";
import { PagePanel } from "../ui/page-panel";
import { StatusBadge } from "../ui/status-badge";

type UserFormState = {
  email: string;
  password: string;
  role: AdminUserRole;
  status: AdminUserStatus;
};

const EMPTY_FORM: UserFormState = {
  email: "",
  password: "",
  role: "user",
  status: "active",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "사용자 요청 처리에 실패했습니다.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function statusTone(status: AdminUserStatus): "success" | "warning" {
  return status === "active" ? "success" : "warning";
}

function toCreateRequest(form: UserFormState): AdminUserCreateRequest {
  return {
    email: form.email.trim(),
    password: form.password,
    role: form.role,
    status: form.status,
  };
}

export function UsersManagement() {
  const [rows, setRows] = useState<AdminUserItem[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminUserStatus | "all">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AdminUserItem | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listAdminUsers();
      setRows(response.items);
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
      const matchesQuery = !normalizedQuery || row.email.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  function openCreateModal() {
    setSelectedRow(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openEditModal(row: AdminUserItem) {
    setSelectedRow(row);
    setForm({
      email: row.email,
      password: "",
      role: row.role,
      status: row.status,
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setSelectedRow(null);
    setForm(EMPTY_FORM);
  }

  async function saveUser() {
    if (!form.email.trim()) {
      setError("이메일을 입력해 주세요.");
      return;
    }
    if (!selectedRow && form.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      let saved: AdminUserItem;
      if (selectedRow) {
        saved = await patchAdminUser(selectedRow.id, {
          email: form.email.trim(),
          role: form.role,
          status: form.status,
        });
        setRows((current) => current.map((item) => (item.id === selectedRow.id ? saved : item)));
        setMessage("사용자 정보가 수정되었습니다.");
      } else {
        saved = await createAdminUser(toCreateRequest(form));
        setRows((current) => [saved, ...current]);
        setMessage("사용자가 생성되었습니다.");
      }
      closeEditor();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeUser(row: AdminUserItem) {
    if (!window.confirm(`${row.email} 사용자를 삭제하시겠습니까?`)) return;
    try {
      await deleteAdminUser(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setMessage("사용자가 삭제되었습니다.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel title="사용자 관리" description="기관 소속 일반 사용자 계정을 관리합니다.">
        {message ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="사용자 이메일 검색"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as AdminUserStatus | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
          </select>
          <button
            type="button"
            onClick={() => setQuery(queryInput.trim())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            검색
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            사용자 생성
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {isLoading ? "사용자 목록을 불러오는 중..." : `총 ${filteredRows.length}명`}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-3">이메일</th>
                <th className="px-3 py-3">역할</th>
                <th className="px-3 py-3">상태</th>
                <th className="px-3 py-3">생성일</th>
                <th className="px-3 py-3">수정일</th>
                <th className="px-3 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                    사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-3 font-medium text-slate-900">{row.email}</td>
                    <td className="px-3 py-3">{row.role}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                    </td>
                    <td className="px-3 py-3">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-3">{formatDateTime(row.updatedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeUser(row)}
                          className="rounded-lg border border-rose-300 px-3 py-2 text-xs text-rose-700"
                        >
                          삭제
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
        title={selectedRow ? "사용자 수정" : "사용자 생성"}
        description="일반 사용자 계정은 user 역할만 허용됩니다."
        onClose={closeEditor}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">이메일</span>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {!selectedRow ? (
            <label className="text-sm text-slate-700 md:col-span-2">
              <span className="mb-1 block font-medium">비밀번호</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          ) : null}
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">역할</span>
            <select
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as AdminUserRole }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="user">user</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">상태</span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({ ...current, status: event.target.value as AdminUserStatus }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeEditor}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void saveUser()}
            disabled={isSaving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </AdminModal>
    </div>
  );
}
