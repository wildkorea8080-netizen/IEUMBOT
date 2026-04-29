"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  activateSuperAdminOrganization,
  createSuperAdminOrganization,
  getSuperAdminOrganization,
  impersonateSuperAdminOrganization,
  listSuperAdminOrganizations,
  patchSuperAdminOrganization,
  suspendSuperAdminOrganization,
} from "../lib/api/super-admin-organizations";
import type {
  SuperAdminOrganizationDetail,
  SuperAdminOrganizationListItem,
  SuperAdminOrganizationStatus,
  SuperAdminOrganizationUpsertRequest,
} from "../lib/api/super-admin-organizations-types";
import { beginAdminImpersonation } from "../lib/auth/token";
import { AdminModal } from "./ui/admin-modal";
import { CopyButton } from "./ui/copy-button";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type FormState = {
  name: string;
  code: string;
  adminEmail: string;
  adminName: string;
  primaryDomain: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: SuperAdminOrganizationStatus;
};

type CreatedAdminCredentials = {
  adminEmail: string;
  tempPassword: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapOrganizationErrorCode(code: string): string | null {
  switch (code) {
    case "ADMIN_EMAIL_ALREADY_EXISTS":
      return "이미 등록된 관리자 이메일입니다. 다른 이메일을 입력하거나 기존 관리자를 선택해 주세요.";
    case "ADMIN_EMAIL_ALREADY_ASSIGNED_TO_OTHER_ORGANIZATION":
      return "이미 다른 기관에 소속된 관리자 이메일입니다. 해당 기관의 관리자를 확인해 주세요.";
    case "SUPER_ADMIN_EMAIL_REUSE_FORBIDDEN":
      return "전체관리자 이메일은 기관 관리자로 사용할 수 없습니다.";
    case "ORGANIZATION_CODE_ALREADY_EXISTS":
      return "이미 사용 중인 기관코드입니다. 다른 기관코드를 입력해 주세요.";
    case "PRIMARY_DOMAIN_ALREADY_EXISTS":
      return "이미 등록된 대표 도메인입니다. 다른 도메인을 입력해 주세요.";
    case "INVALID_ORGANIZATION_NAME":
      return "기관명을 입력해 주세요.";
    case "INVALID_ORGANIZATION_CODE":
      return "기관코드는 영문 소문자, 숫자, 하이픈(-), 언더스코어(_)만 사용할 수 있습니다.";
    case "INVALID_ADMIN_EMAIL":
      return "관리자 이메일 형식이 올바르지 않습니다.";
    case "INVALID_ADMIN_NAME":
      return "관리자 이름을 입력해 주세요.";
    case "INVALID_PRIMARY_DOMAIN":
      return "대표 도메인 형식이 올바르지 않습니다.";
    case "INVALID_CONTACT_EMAIL":
      return "담당자 이메일 형식이 올바르지 않습니다.";
    default:
      return null;
  }
}

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  adminEmail: "",
  adminName: "",
  primaryDomain: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  status: "active",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return mapOrganizationErrorCode(error.code) ?? error.message;
  if (error instanceof Error) return error.message;
  return "기관 요청 처리에 실패했습니다.";
}

function toForm(detail: SuperAdminOrganizationDetail | null): FormState {
  if (!detail) return EMPTY_FORM;
  return {
    name: detail.name,
    code: detail.code,
    adminEmail: "",
    adminName: "",
    primaryDomain: detail.primaryDomain ?? "",
    contactName: detail.contactName ?? "",
    contactEmail: detail.contactEmail ?? "",
    contactPhone: detail.contactPhone ?? "",
    status: detail.status,
  };
}

function toCreateRequest(form: FormState): SuperAdminOrganizationUpsertRequest {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    adminEmail: form.adminEmail.trim(),
    adminName: form.adminName.trim(),
    primaryDomain: form.primaryDomain.trim() || null,
    contactName: form.contactName.trim() || null,
    contactEmail: form.contactEmail.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    status: form.status,
  };
}

function toUpdateRequest(form: FormState): Partial<SuperAdminOrganizationUpsertRequest> {
  return {
    name: form.name.trim(),
    primaryDomain: form.primaryDomain.trim() || null,
    contactName: form.contactName.trim() || null,
    contactEmail: form.contactEmail.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    status: form.status,
  };
}

function statusTone(status: SuperAdminOrganizationStatus): "success" | "warning" | "info" {
  if (status === "active") return "success";
  if (status === "trial") return "info";
  return "warning";
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ko-KR");
}

function formatStatus(value?: string | null): string {
  return value || "-";
}

export function SuperAdminOrganizations() {
  const [items, setItems] = useState<SuperAdminOrganizationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SuperAdminOrganizationStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string>("new");
  const [detail, setDetail] = useState<SuperAdminOrganizationDetail | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonationModalOpen, setImpersonationModalOpen] = useState(false);
  const [impersonationReason, setImpersonationReason] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<CreatedAdminCredentials | null>(null);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSummary = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  async function loadOrganizations(preferredId?: string) {
    setIsLoadingList(true);
    setError(null);
    try {
      const response = await listSuperAdminOrganizations({
        q: query,
        status: statusFilter,
        page: 1,
        pageSize: 20,
      });
      setItems(response.items);
      setTotal(response.total);

      const targetId = preferredId ?? selectedId;
      const nextSelected =
        targetId !== "new" && response.items.some((item) => item.id === targetId)
          ? targetId
          : response.items[0]?.id ?? "new";
      setSelectedId(nextSelected);
      if (nextSelected === "new") {
        setDetail(null);
        setForm(EMPTY_FORM);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setItems([]);
      setTotal(0);
      setSelectedId("new");
      setDetail(null);
      setForm(EMPTY_FORM);
    } finally {
      setIsLoadingList(false);
    }
  }

  useEffect(() => {
    void loadOrganizations();
  }, [query, statusFilter]);

  useEffect(() => {
    if (selectedId === "new") {
      setDetail(null);
      setForm(EMPTY_FORM);
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      setIsLoadingDetail(true);
      setError(null);
      try {
        const response = await getSuperAdminOrganization(selectedId);
        if (cancelled) return;
        setDetail(response);
        setForm(toForm(response));
      } catch (detailError) {
        if (cancelled) return;
        setError(getErrorMessage(detailError));
      } finally {
        if (!cancelled) setIsLoadingDetail(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  function resetCreateState() {
    setSelectedId("new");
    setDetail(null);
    setForm(EMPTY_FORM);
    setCreatedCredentials(null);
    setCredentialsModalOpen(false);
    setError(null);
    setMessage(null);
  }

  async function saveOrganization() {
    if (!form.name.trim()) {
      setError("기관명을 입력해 주세요.");
      return;
    }
    if (selectedId === "new" && !form.code.trim()) {
      setError("기관코드를 입력해 주세요.");
      return;
    }
    if (selectedId === "new" && !form.adminEmail.trim()) {
      setError("관리자 이메일을 입력해 주세요.");
      return;
    }
    if (selectedId === "new" && !EMAIL_PATTERN.test(form.adminEmail.trim())) {
      setError("관리자 이메일 형식이 올바르지 않습니다.");
      return;
    }
    if (selectedId === "new" && !form.adminName.trim()) {
      setError("관리자 이름을 입력해 주세요.");
      return;
    }
    if (form.contactEmail.trim() && !EMAIL_PATTERN.test(form.contactEmail.trim())) {
      setError("담당자 이메일 형식이 올바르지 않습니다.");
      return;
    }
    if (!form.name.trim()) {
      setError("기관명을 입력해 주세요.");
      return;
    }
    if (selectedId === "new" && !form.code.trim()) {
      setError("기관 코드를 입력해 주세요.");
      return;
    }
    if (selectedId === "new" && !form.adminEmail.trim()) {
      setError("관리자 이메일을 입력해 주세요.");
      return;
    }
    if (selectedId === "new" && !form.adminName.trim()) {
      setError("관리자 이름을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (selectedId === "new") {
        const created = await createSuperAdminOrganization(toCreateRequest(form));
        setSelectedId(created.id);
        setDetail(created);
        setForm(toForm(created));
        if (created.tempPassword) {
          setCreatedCredentials({
            adminEmail: created.adminEmail,
            tempPassword: created.tempPassword,
          });
          setCredentialsModalOpen(true);
          setMessage("기관과 관리자 계정이 생성되었습니다.");
        } else {
          setCreatedCredentials(null);
          setCredentialsModalOpen(false);
          setMessage("기관이 생성되고 기존 관리자 계정이 연결되었습니다.");
        }
        await loadOrganizations(created.id);
        return;
      }

      let saved: SuperAdminOrganizationDetail;
      saved = await patchSuperAdminOrganization(selectedId, toUpdateRequest(form));

      setSelectedId(saved.id);
      setDetail(saved);
      setForm(toForm(saved));
      setMessage(selectedId === "new" ? "기관이 생성되었습니다." : "기관 정보가 수정되었습니다.");
      await loadOrganizations(saved.id);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function runStatusAction(action: () => Promise<SuperAdminOrganizationDetail>, successMessage: string) {
    try {
      setError(null);
      const updated = await action();
      setDetail(updated);
      setForm(toForm(updated));
      setMessage(successMessage);
      await loadOrganizations(updated.id);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    }
  }

  async function startImpersonation() {
    if (!detail) return;
    const reason = impersonationReason.trim();
    if (!reason) {
      setError("대리 접속 사유를 입력해 주세요.");
      return;
    }

    setIsImpersonating(true);
    setError(null);
    try {
      const response = await impersonateSuperAdminOrganization(detail.id, { reason });
      beginAdminImpersonation({
        impersonationToken: response.impersonationToken,
        organizationId: detail.id,
        organizationName: detail.name,
        reason,
        expiresAt: response.expiresAt,
      });
      setImpersonationModalOpen(false);
      setImpersonationReason("");
      window.location.href = response.redirectUrl;
    } catch (impersonationError) {
      setError(getErrorMessage(impersonationError));
    } finally {
      setIsImpersonating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel
        title="기관 관리"
        description="기관 목록 조회, 상태 관리, 기관 생성과 초기 관리자 발급을 처리합니다."
      >
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
            placeholder="기관명, 코드, 도메인 검색"
            className="min-w-[260px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SuperAdminOrganizationStatus | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성</option>
            <option value="trial">체험</option>
            <option value="suspended">중지</option>
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
            onClick={resetCreateState}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            기관 생성
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {isLoadingList ? "기관 목록을 불러오는 중..." : `총 ${total}개 기관`}
        </div>

        <div className="mt-4 grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
          <div className="space-y-3">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                등록된 기관이 없습니다.
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border p-4 text-left ${
                    selectedId === item.id ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-sm text-slate-900">{item.name}</strong>
                      <p className="mt-1 text-xs text-slate-500">{item.code}</p>
                    </div>
                    <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <span>챗봇 {item.chatbotCount}</span>
                    <span>계약 {formatStatus(item.contractStatus)}</span>
                    <span>{item.primaryDomain ?? "도메인 없음"}</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {selectedId === "new" ? "기관 생성" : detail?.name ?? selectedSummary?.name ?? "기관 상세"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedId === "new"
                    ? "기관과 기본 institution_admin 계정을 함께 생성합니다."
                    : "기본 정보와 최근 운영 상태를 확인합니다."}
                </p>
              </div>
              {selectedId !== "new" && detail ? (
                <StatusBadge tone={statusTone(detail.status)}>{detail.status}</StatusBadge>
              ) : null}
            </div>

            {selectedId !== "new" && detail ? (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">관리자</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{detail.adminCount}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">챗봇</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{detail.chatbotCount}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">위젯</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{detail.widgetCount}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">최근 30일 대화</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {detail.recentUsageSummary.last30DaysConversationCount}
                  </p>
                </div>
              </div>
            ) : null}

            {selectedId !== "new" && isLoadingDetail ? (
              <p className="mt-4 text-sm text-slate-500">기관 상세를 불러오는 중...</p>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700 md:col-span-2">
                <span className="mb-1 block font-medium">기관명</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">기관코드</span>
                <input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  placeholder="institution-code"
                  disabled={selectedId !== "new"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">상태</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as SuperAdminOrganizationStatus,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="active">활성</option>
                  <option value="trial">체험</option>
                  <option value="suspended">중지</option>
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">관리자 이메일</span>
                <input
                  value={form.adminEmail}
                  onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))}
                  placeholder="admin@example.com"
                  disabled={selectedId !== "new"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">관리자 이름</span>
                <input
                  value={form.adminName}
                  onChange={(event) => setForm((current) => ({ ...current, adminName: event.target.value }))}
                  disabled={selectedId !== "new"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">대표 도메인</span>
                <input
                  value={form.primaryDomain}
                  onChange={(event) => setForm((current) => ({ ...current, primaryDomain: event.target.value }))}
                  placeholder="example.go.kr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">담당자명</span>
                <input
                  value={form.contactName}
                  onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">담당자 이메일</span>
                <input
                  value={form.contactEmail}
                  onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700 md:col-span-2">
                <span className="mb-1 block font-medium">담당자 전화번호</span>
                <input
                  value={form.contactPhone}
                  onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            {detail ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="grid gap-2 md:grid-cols-2">
                  <p>요금제: {detail.contractSummary.planName ?? "-"}</p>
                  <p>계약 상태: {formatStatus(detail.contractSummary.status)}</p>
                  <p>계약 시작일: {formatDate(detail.contractSummary.startDate)}</p>
                  <p>계약 종료일: {formatDate(detail.contractSummary.endDate)}</p>
                  <p>기관코드: {detail.code}</p>
                  <p>생성일: {formatDate(detail.createdAt)}</p>
                  <p>수정일: {formatDate(detail.updatedAt)}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                {detail ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setImpersonationReason("");
                        setImpersonationModalOpen(true);
                      }}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700"
                    >
                      기관 접속
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void runStatusAction(
                          () => activateSuperAdminOrganization(detail.id),
                          "기관이 활성 상태로 변경되었습니다.",
                        )
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    >
                      활성화
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void runStatusAction(
                          () => suspendSuperAdminOrganization(detail.id),
                          "기관이 중지 상태로 변경되었습니다.",
                        )
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    >
                      중지
                    </button>
                  </>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(toForm(detail))}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={() => void saveOrganization()}
                  disabled={isSaving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {isSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </PagePanel>

      <AdminModal
        open={impersonationModalOpen}
        title="기관 대리 접속"
        description="기관 관리자 권한으로 접속하며 모든 작업은 감사 로그에 기록됩니다."
        onClose={() => {
          if (isImpersonating) return;
          setImpersonationModalOpen(false);
          setImpersonationReason("");
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            지원, 장애 확인, 설정 검증 같은 목적에서만 사용해 주세요.
          </p>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">사유</span>
            <textarea
              value={impersonationReason}
              onChange={(event) => setImpersonationReason(event.target.value)}
              rows={4}
              placeholder="예: 고객 문의 재현, 설정 상태 점검"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setImpersonationModalOpen(false);
                setImpersonationReason("");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void startImpersonation()}
              disabled={isImpersonating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isImpersonating ? "접속 중..." : "기관으로 이동"}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        open={credentialsModalOpen}
        title="기관 관리자 계정 발급"
        description="임시 비밀번호는 한 번만 표시됩니다. 바로 복사해 안전한 채널로 전달해 주세요."
        onClose={() => {
          setCredentialsModalOpen(false);
          setCreatedCredentials(null);
        }}
      >
        {createdCredentials ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">이메일</p>
                  <p className="mt-1 break-all font-medium text-slate-900">{createdCredentials.adminEmail}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">임시 비밀번호</p>
                  <p className="mt-1 break-all font-mono text-base text-slate-900">{createdCredentials.tempPassword}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <CopyButton
                text={createdCredentials.adminEmail}
                label="이메일 복사"
                onCopied={(nextMessage, tone) => {
                  if (tone === "success") setMessage(nextMessage);
                  else setError(nextMessage);
                }}
              />
              <CopyButton
                text={createdCredentials.tempPassword}
                label="비밀번호 복사"
                onCopied={(nextMessage, tone) => {
                  if (tone === "success") setMessage(nextMessage);
                  else setError(nextMessage);
                }}
              />
              <CopyButton
                text={`email: ${createdCredentials.adminEmail}\npassword: ${createdCredentials.tempPassword}`}
                label="전체 복사"
                onCopied={(nextMessage, tone) => {
                  if (tone === "success") setMessage(nextMessage);
                  else setError(nextMessage);
                }}
              />
            </div>
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
