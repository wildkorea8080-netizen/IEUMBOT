"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, KeyRound, RefreshCw, UserCog } from "lucide-react";

import { ApiClientError } from "../lib/api";
import {
  listSuperAdminOrgAdmins,
  resetSuperAdminAdminPassword,
} from "../lib/api/super-admin-accounts-contracts";
import type {
  SuperAdminOrgAdminItem,
} from "../lib/api/super-admin-accounts-contracts-types";
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
  chatbotLimit: string;
};

type CreatedAdminCredentials = {
  adminEmail: string;
  tempPassword: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function mapOrganizationErrorCode(code: string): string | null {
  switch (code) {
    case "ADMIN_EMAIL_ALREADY_EXISTS":
      return "이미 등록된 관리자 이메일입니다. 다른 이메일을 입력하거나 기존 관리자를 선택해 주세요.";
    case "ADMIN_EMAIL_ALREADY_ASSIGNED_TO_OTHER_ORGANIZATION":
      return "이미 다른 기관에 소속된 관리자 이메일입니다.";
    case "SUPER_ADMIN_EMAIL_REUSE_FORBIDDEN":
      return "전체관리자 이메일은 기관 관리자로 사용할 수 없습니다.";
    case "ORGANIZATION_CODE_ALREADY_EXISTS":
      return "이미 사용 중인 기관코드입니다. 다른 기관코드를 입력해 주세요.";
    case "PRIMARY_DOMAIN_ALREADY_EXISTS":
      return "이미 등록된 대표 도메인입니다.";
    case "IMPERSONATION_SUSPENDED_ORGANIZATION_FORBIDDEN":
      return "중지된 기관에는 대리 접속할 수 없습니다.";
    case "IMPERSONATION_EXPIRED_CONTRACT_FORBIDDEN":
      return "계약이 만료된 기관에는 대리 접속할 수 없습니다.";
    case "IMPERSONATION_REASON_REQUIRED":
      return "접속 사유를 입력해 주세요.";
    default:
      return null;
  }
}

const EMPTY_FORM: FormState = {
  name: "", code: "", adminEmail: "", adminName: "",
  primaryDomain: "", contactName: "", contactEmail: "", contactPhone: "", status: "active",
  chatbotLimit: "1",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return mapOrganizationErrorCode(error.code) ?? error.message;
  if (error instanceof Error) return error.message;
  return "요청 처리에 실패했습니다.";
}

function toForm(detail: SuperAdminOrganizationDetail | null): FormState {
  if (!detail) return EMPTY_FORM;
  return {
    name: detail.name, code: detail.code, adminEmail: "", adminName: "",
    primaryDomain: detail.primaryDomain ?? "", contactName: detail.contactName ?? "",
    contactEmail: detail.contactEmail ?? "", contactPhone: detail.contactPhone ?? "",
    status: detail.status,
    chatbotLimit: String(detail.chatbotLimit ?? 1),
  };
}

function toCreateRequest(form: FormState): SuperAdminOrganizationUpsertRequest {
  return {
    name: form.name.trim(), code: form.code.trim(),
    adminEmail: form.adminEmail.trim(), adminName: form.adminName.trim(),
    primaryDomain: form.primaryDomain.trim() || null,
    contactName: form.contactName.trim() || null,
    contactEmail: form.contactEmail.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    status: form.status,
  };
}

function toUpdateRequest(form: FormState): Partial<SuperAdminOrganizationUpsertRequest> {
  const parsedLimit = Math.max(1, Math.min(100, Math.trunc(Number(form.chatbotLimit) || 1)));
  return {
    name: form.name.trim(), primaryDomain: form.primaryDomain.trim() || null,
    contactName: form.contactName.trim() || null,
    contactEmail: form.contactEmail.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    status: form.status,
    chatbotLimit: parsedLimit,
  };
}

function statusTone(status: SuperAdminOrganizationStatus): "success" | "warning" | "info" {
  if (status === "active") return "success";
  if (status === "trial") return "info";
  return "warning";
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("ko-KR");
}

function adminStatusBadge(status: string): string {
  if (status === "active") return "badge-success";
  if (status === "inactive") return "badge-warning";
  return "badge-neutral";
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
  const [orgAdmins, setOrgAdmins] = useState<SuperAdminOrgAdminItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStatusActioning, setIsStatusActioning] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [impersonationModalOpen, setImpersonationModalOpen] = useState(false);
  const [impersonationReason, setImpersonationReason] = useState("");
  const [impersonationError, setImpersonationError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedAdminCredentials | null>(null);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [resetPasswordCredentials, setResetPasswordCredentials] = useState<CreatedAdminCredentials | null>(null);
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
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
      const response = await listSuperAdminOrganizations({ q: query, status: statusFilter, page: 1, pageSize: 20 });
      setItems(response.items);
      setTotal(response.total);
      const targetId = preferredId ?? selectedId;
      const nextSelected =
        targetId !== "new" && response.items.some((item) => item.id === targetId)
          ? targetId
          : response.items[0]?.id ?? "new";
      setSelectedId(nextSelected);
      if (nextSelected === "new") { setDetail(null); setForm(EMPTY_FORM); }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setItems([]); setTotal(0); setSelectedId("new"); setDetail(null); setForm(EMPTY_FORM);
    } finally {
      setIsLoadingList(false);
    }
  }

  async function loadOrgAdmins(orgId: string) {
    setIsLoadingAdmins(true);
    setOrgAdmins([]);
    try {
      const res = await listSuperAdminOrgAdmins(orgId);
      setOrgAdmins(res.items);
    } catch {
      setOrgAdmins([]);
    } finally {
      setIsLoadingAdmins(false);
    }
  }

  useEffect(() => { void loadOrganizations(); }, [query, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId === "new") { setDetail(null); setForm(EMPTY_FORM); setOrgAdmins([]); return; }
    let cancelled = false;
    async function loadDetail() {
      setIsLoadingDetail(true);
      setError(null);
      try {
        const response = await getSuperAdminOrganization(selectedId);
        if (cancelled) return;
        setDetail(response);
        setForm(toForm(response));
        void loadOrgAdmins(selectedId);
      } catch (detailError) {
        if (cancelled) return;
        setError(getErrorMessage(detailError));
      } finally {
        if (!cancelled) setIsLoadingDetail(false);
      }
    }
    void loadDetail();
    return () => { cancelled = true; };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismissMessage() { setMessage(null); setError(null); }

  function resetCreateState() {
    setSelectedId("new"); setDetail(null); setForm(EMPTY_FORM);
    setCreatedCredentials(null); setCredentialsModalOpen(false);
    setError(null); setMessage(null); setOrgAdmins([]);
  }

  async function saveOrganization() {
    if (!form.name.trim()) { setError("기관명을 입력해 주세요."); return; }
    if (selectedId === "new" && !form.code.trim()) { setError("기관코드를 입력해 주세요."); return; }
    if (selectedId === "new" && !form.adminEmail.trim()) { setError("관리자 이메일을 입력해 주세요."); return; }
    if (selectedId === "new" && !EMAIL_PATTERN.test(form.adminEmail.trim())) {
      setError("관리자 이메일 형식이 올바르지 않습니다."); return;
    }
    if (selectedId === "new" && !form.adminName.trim()) { setError("관리자 이름을 입력해 주세요."); return; }
    if (form.contactEmail.trim() && !EMAIL_PATTERN.test(form.contactEmail.trim())) {
      setError("담당자 이메일 형식이 올바르지 않습니다."); return;
    }
    setIsSaving(true); setError(null);
    try {
      if (selectedId === "new") {
        const created = await createSuperAdminOrganization(toCreateRequest(form));
        setSelectedId(created.id); setDetail(created); setForm(toForm(created));
        if (created.tempPassword) {
          setCreatedCredentials({ adminEmail: created.adminEmail, tempPassword: created.tempPassword });
          setCredentialsModalOpen(true);
          setMessage("기관과 관리자 계정이 생성되었습니다.");
        } else {
          setMessage("기관이 생성되었습니다.");
        }
        await loadOrganizations(created.id);
        return;
      }
      const saved = await patchSuperAdminOrganization(selectedId, toUpdateRequest(form));
      setSelectedId(saved.id); setDetail(saved); setForm(toForm(saved));
      setMessage("기관 정보가 수정되었습니다.");
      await loadOrganizations(saved.id);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function runStatusAction(action: () => Promise<SuperAdminOrganizationDetail>, successMessage: string) {
    setIsStatusActioning(true);
    setError(null);
    try {
      const updated = await action();
      setDetail(updated); setForm(toForm(updated));
      setMessage(successMessage);
      await loadOrganizations(updated.id);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setIsStatusActioning(false);
    }
  }

  async function startImpersonation() {
    if (!detail) return;
    const reason = impersonationReason.trim();
    if (!reason) { setImpersonationError("접속 사유를 입력해 주세요."); return; }
    setIsImpersonating(true); setImpersonationError(null);
    try {
      const response = await impersonateSuperAdminOrganization(detail.id, { reason });
      beginAdminImpersonation({
        impersonationToken: response.impersonationToken,
        organizationId: detail.id, organizationName: detail.name,
        reason, expiresAt: response.expiresAt,
      });
      setImpersonationModalOpen(false); setImpersonationReason("");
      window.location.href = response.redirectUrl;
    } catch (impersonationError) {
      setImpersonationError(getErrorMessage(impersonationError));
    } finally {
      setIsImpersonating(false);
    }
  }

  async function resetAdminPassword(admin: SuperAdminOrgAdminItem) {
    const tempPassword = generateTempPassword();
    setIsResettingPassword(true);
    setError(null);
    try {
      await resetSuperAdminAdminPassword(admin.id, { temporaryPassword: tempPassword });
      setResetPasswordCredentials({ adminEmail: admin.email, tempPassword });
      setResetPasswordModalOpen(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsResettingPassword(false);
    }
  }

  const actionDisabled = isStatusActioning || isLoadingDetail;

  return (
    <div className="space-y-6">
      <PagePanel title="기관 관리" description="기관 목록 조회, 상태 관리, 기관 생성과 초기 관리자 발급을 처리합니다.">
        {/* 메시지 / 에러 배너 */}
        {message && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <span>{message}</span>
            <button type="button" onClick={dismissMessage} className="ml-4 text-emerald-500 hover:text-emerald-700">✕</button>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <span>{error}</span>
            <button type="button" onClick={dismissMessage} className="ml-4 text-rose-400 hover:text-rose-600">✕</button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setQuery(queryInput.trim()); }}
            placeholder="기관명, 코드, 도메인 검색"
            className="min-w-[260px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SuperAdminOrganizationStatus | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성</option>
            <option value="trial">체험</option>
            <option value="suspended">중지</option>
          </select>
          <button type="button" onClick={() => setQuery(queryInput.trim())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">검색</button>
          <button type="button" onClick={resetCreateState}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">기관 생성</button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {isLoadingList ? "기관 목록을 불러오는 중..." : `총 ${total}개 기관`}
        </div>

        <div className="mt-4 grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
          {/* 목록 */}
          <div className="space-y-3">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                등록된 기관이 없습니다.
              </div>
            ) : (
              items.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border p-4 text-left ${selectedId === item.id ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-sm text-slate-900">{item.name}</strong>
                      <p className="mt-1 text-xs text-slate-500">{item.code}</p>
                    </div>
                    <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <span>챗봇 {item.chatbotCount}/{item.chatbotLimit}</span>
                    <span>계약 {item.contractStatus || "-"}</span>
                    <span>{item.primaryDomain ?? "도메인 없음"}</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* 상세 패널 */}
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

            {/* 챗봇 없음 경고 */}
            {selectedId !== "new" && detail && detail.chatbotCount === 0 && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">챗봇이 없습니다</p>
                  <p className="mt-0.5 text-xs">
                    이 기관에 연결된 챗봇이 없어 기관 관리자가 챗봇을 사용할 수 없습니다.{" "}
                    <Link href="/super-admin/chatbots" className="underline font-medium">챗봇 관리</Link>에서 챗봇을 생성해 주세요.
                  </p>
                </div>
              </div>
            )}

            {/* 통계 요약 */}
            {selectedId !== "new" && detail ? (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  { label: "관리자", value: detail.adminCount },
                  { label: "챗봇", value: detail.chatbotCount },
                  { label: "위젯", value: detail.widgetCount },
                  { label: "최근 30일 대화", value: detail.recentUsageSummary.last30DaysConversationCount },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedId !== "new" && isLoadingDetail ? (
              <p className="mt-4 text-sm text-slate-500">기관 상세를 불러오는 중...</p>
            ) : null}

            {/* 폼 필드 */}
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700 md:col-span-2">
                <span className="mb-1 block font-medium">기관명</span>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">기관코드</span>
                <input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="institution-code" disabled={selectedId !== "new"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">상태</span>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SuperAdminOrganizationStatus }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                  <option value="active">활성</option>
                  <option value="trial">체험</option>
                  <option value="suspended">중지</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">챗봇 생성 한도</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.chatbotLimit}
                  onChange={(e) => setForm((p) => ({ ...p, chatbotLimit: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                <span className="mt-1 block text-xs text-slate-400">
                  이 기관이 만들 수 있는 챗봇 최대 개수 (기본 1)
                  {selectedId !== "new" && detail ? ` · 현재 ${detail.chatbotCount}개 사용 중` : ""}
                </span>
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">관리자 이메일</span>
                <input value={form.adminEmail} onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
                  placeholder="admin@example.com" disabled={selectedId !== "new"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">관리자 이름</span>
                <input value={form.adminName} onChange={(e) => setForm((p) => ({ ...p, adminName: e.target.value }))}
                  disabled={selectedId !== "new"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">대표 도메인</span>
                <input value={form.primaryDomain} onChange={(e) => setForm((p) => ({ ...p, primaryDomain: e.target.value }))}
                  placeholder="example.go.kr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">담당자명</span>
                <input value={form.contactName} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">담당자 이메일</span>
                <input value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700 md:col-span-2">
                <span className="mb-1 block font-medium">담당자 전화번호</span>
                <input value={form.contactPhone} onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
            </div>

            {/* 계약 요약 */}
            {detail ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="grid gap-2 md:grid-cols-2">
                  <p>요금제: {detail.contractSummary.planName ?? "-"}</p>
                  <p>계약 상태: {detail.contractSummary.status || "-"}</p>
                  <p>계약 시작일: {formatDate(detail.contractSummary.startDate)}</p>
                  <p>계약 종료일: {formatDate(detail.contractSummary.endDate)}</p>
                  <p>기관코드: {detail.code}</p>
                  <p>생성일: {formatDate(detail.createdAt)}</p>
                </div>
              </div>
            ) : null}

            {/* 액션 버튼 */}
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {detail ? (
                  <>
                    <button type="button" disabled={actionDisabled}
                      onClick={() => { setImpersonationReason(""); setImpersonationError(null); setImpersonationModalOpen(true); }}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 disabled:opacity-50">
                      기관 접속
                    </button>
                    <button type="button" disabled={actionDisabled}
                      onClick={() => void runStatusAction(() => activateSuperAdminOrganization(detail.id), "기관이 활성 상태로 변경되었습니다.")}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
                      {isStatusActioning ? "처리 중..." : "활성화"}
                    </button>
                    <button type="button" disabled={actionDisabled}
                      onClick={() => void runStatusAction(() => suspendSuperAdminOrganization(detail.id), "기관이 중지되었습니다.")}
                      className="rounded-lg border border-rose-200 px-4 py-2 text-sm text-rose-700 disabled:opacity-50">
                      {isStatusActioning ? "처리 중..." : "중지"}
                    </button>
                  </>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => { setForm(toForm(detail)); setMessage("폼이 초기화되었습니다."); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
                  초기화
                </button>
                <button type="button" onClick={() => void saveOrganization()} disabled={isSaving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {isSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 관리자 계정 섹션 */}
        {selectedId !== "new" && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-4">
              <UserCog className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">관리자 계정</h3>
              <button type="button" onClick={() => void loadOrgAdmins(selectedId)}
                className="ml-auto rounded-md border border-slate-200 p-1 text-slate-400 hover:text-slate-600" title="새로고침">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            {isLoadingAdmins ? (
              <p className="text-sm text-slate-400">관리자 목록을 불러오는 중...</p>
            ) : orgAdmins.length === 0 ? (
              <p className="text-sm text-slate-400">등록된 관리자가 없습니다.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 500, color: "#64748b" }}>이름</th>
                      <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 500, color: "#64748b" }}>이메일</th>
                      <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 500, color: "#64748b" }}>상태</th>
                      <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 500, color: "#64748b" }}>마지막 로그인</th>
                      <th style={{ padding: "8px 14px", textAlign: "right", fontWeight: 500, color: "#64748b" }}>비밀번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgAdmins.map((admin) => (
                      <tr key={admin.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px", color: "#1e293b", fontWeight: 500 }}>{admin.name}</td>
                        <td style={{ padding: "10px 14px", color: "#475569" }}>{admin.email}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span className={adminStatusBadge(admin.status)}>{admin.status}</span>
                        </td>
                        <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>
                          {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "없음"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <button type="button"
                            onClick={() => void resetAdminPassword(admin)}
                            disabled={isResettingPassword}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#d97706", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "4px 10px", cursor: "pointer", opacity: isResettingPassword ? 0.5 : 1 }}>
                            <KeyRound style={{ width: 12, height: 12 }} />
                            {isResettingPassword ? "처리 중..." : "비밀번호 재발급"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </PagePanel>

      {/* 기관 접속 모달 */}
      <AdminModal open={impersonationModalOpen} title="기관 대리 접속"
        description="기관 관리자 권한으로 접속하며 모든 작업은 감사 로그에 기록됩니다."
        onClose={() => { if (isImpersonating) return; setImpersonationModalOpen(false); setImpersonationReason(""); setImpersonationError(null); }}>
        <div className="space-y-4">
          {impersonationError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {impersonationError}
            </div>
          )}
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            <strong>{detail?.name}</strong> 기관으로 접속합니다. 지원·장애 확인·설정 검증 목적에서만 사용해 주세요.
          </div>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">접속 사유 <span className="text-rose-500">*</span></span>
            <textarea value={impersonationReason} onChange={(e) => setImpersonationReason(e.target.value)}
              rows={3} placeholder="예: 고객 문의 재현, 설정 상태 점검"
              className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setImpersonationModalOpen(false); setImpersonationReason(""); setImpersonationError(null); }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">취소</button>
            <button type="button" onClick={() => void startImpersonation()} disabled={isImpersonating}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {isImpersonating ? "접속 중..." : "기관으로 이동"}
            </button>
          </div>
        </div>
      </AdminModal>

      {/* 계정 발급 모달 (최초 생성) */}
      <AdminModal open={credentialsModalOpen} title="기관 관리자 계정 발급"
        description="임시 비밀번호는 한 번만 표시됩니다. 바로 복사해 안전한 채널로 전달해 주세요."
        onClose={() => { setCredentialsModalOpen(false); setCreatedCredentials(null); }}>
        <CredentialsDisplay credentials={createdCredentials}
          onMessage={setMessage} onError={setError} />
      </AdminModal>

      {/* 비밀번호 재발급 모달 */}
      <AdminModal open={resetPasswordModalOpen} title="비밀번호 재발급 완료"
        description="새 임시 비밀번호를 즉시 복사해 안전하게 전달해 주세요."
        onClose={() => { setResetPasswordModalOpen(false); setResetPasswordCredentials(null); }}>
        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          이 창을 닫으면 비밀번호를 다시 확인할 수 없습니다.
        </div>
        <CredentialsDisplay credentials={resetPasswordCredentials}
          onMessage={setMessage} onError={setError} />
      </AdminModal>
    </div>
  );
}

function CredentialsDisplay({ credentials, onMessage, onError }: {
  credentials: { adminEmail: string; tempPassword: string } | null;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  if (!credentials) return null;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500">이메일</p>
            <p className="mt-1 break-all font-medium text-slate-900">{credentials.adminEmail}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">임시 비밀번호</p>
            <p className="mt-1 break-all font-mono text-base text-slate-900">{credentials.tempPassword}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <CopyButton text={credentials.adminEmail} label="이메일 복사"
          onCopied={(msg, tone) => { if (tone === "success") onMessage(msg); else onError(msg); }} />
        <CopyButton text={credentials.tempPassword} label="비밀번호 복사"
          onCopied={(msg, tone) => { if (tone === "success") onMessage(msg); else onError(msg); }} />
        <CopyButton text={`email: ${credentials.adminEmail}\npassword: ${credentials.tempPassword}`} label="전체 복사"
          onCopied={(msg, tone) => { if (tone === "success") onMessage(msg); else onError(msg); }} />
      </div>
    </div>
  );
}
