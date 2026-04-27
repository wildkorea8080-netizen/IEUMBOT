"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  createSystemAnnouncement,
  disableSystemMaintenance,
  getSystemMaintenance,
  listSystemAnnouncements,
  patchSystemAnnouncement,
  upsertSystemMaintenance,
} from "../lib/api/system-controls";
import type {
  MaintenanceMode,
  PublicAnnouncementType,
  SuperAdminAnnouncementItem,
  SuperAdminAnnouncementPatchRequest,
  SuperAdminAnnouncementUpsertRequest,
  SuperAdminMaintenanceItem,
  SuperAdminMaintenanceUpsertRequest,
} from "../lib/api/system-controls-types";
import { listSuperAdminOrganizations } from "../lib/api/super-admin-organizations";
import type { SuperAdminOrganizationListItem } from "../lib/api/super-admin-organizations-types";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type AnnouncementFormState = {
  id?: string;
  title: string;
  message: string;
  type: PublicAnnouncementType;
  targetScope: "global" | "organization";
  targetOrganizationId: string;
  isActive: boolean;
  startAt: string;
  endAt: string;
};

type MaintenanceFormState = {
  isActive: boolean;
  mode: MaintenanceMode;
  message: string;
  allowedPathsText: string;
  startAt: string;
  endAt: string;
};

const EMPTY_ANNOUNCEMENT_FORM: AnnouncementFormState = {
  title: "",
  message: "",
  type: "info",
  targetScope: "global",
  targetOrganizationId: "",
  isActive: true,
  startAt: "",
  endAt: "",
};

function toDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "요청에 실패했습니다.";
}

function announcementTone(type: PublicAnnouncementType): "info" | "warning" | "danger" {
  if (type === "critical") return "danger";
  if (type === "warning") return "warning";
  return "info";
}

function toAnnouncementForm(item?: SuperAdminAnnouncementItem | null): AnnouncementFormState {
  if (!item) return EMPTY_ANNOUNCEMENT_FORM;
  return {
    id: item.id,
    title: item.title,
    message: item.message,
    type: item.type,
    targetScope: item.targetScope,
    targetOrganizationId: item.targetOrganizationId ?? "",
    isActive: item.isActive,
    startAt: toDateTimeInput(item.startAt),
    endAt: toDateTimeInput(item.endAt),
  };
}

function toAnnouncementBody(form: AnnouncementFormState): SuperAdminAnnouncementUpsertRequest {
  return {
    title: form.title.trim(),
    message: form.message.trim(),
    type: form.type,
    targetScope: form.targetScope,
    targetOrganizationId: form.targetScope === "organization" ? form.targetOrganizationId || null : null,
    isActive: form.isActive,
    startAt: new Date(form.startAt).toISOString(),
    endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
  };
}

function toMaintenanceForm(item?: SuperAdminMaintenanceItem | null): MaintenanceFormState {
  if (!item) {
    return {
      isActive: false,
      mode: "read_only",
      message: "",
      allowedPathsText: "",
      startAt: "",
      endAt: "",
    };
  }
  return {
    isActive: item.isActive,
    mode: item.mode,
    message: item.message,
    allowedPathsText: (item.allowedPaths ?? []).join("\n"),
    startAt: toDateTimeInput(item.startAt),
    endAt: toDateTimeInput(item.endAt),
  };
}

function toMaintenanceBody(form: MaintenanceFormState): SuperAdminMaintenanceUpsertRequest {
  return {
    isActive: form.isActive,
    mode: form.mode,
    message: form.message.trim(),
    allowedPaths: form.allowedPathsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    startAt: new Date(form.startAt).toISOString(),
    endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
  };
}

export function SuperAdminSystemManagement() {
  const [organizations, setOrganizations] = useState<SuperAdminOrganizationListItem[]>([]);
  const [announcements, setAnnouncements] = useState<SuperAdminAnnouncementItem[]>([]);
  const [maintenance, setMaintenance] = useState<SuperAdminMaintenanceItem | null>(null);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>(EMPTY_ANNOUNCEMENT_FORM);
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormState>(toMaintenanceForm(null));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);

  const selectedAnnouncement = useMemo(
    () => announcements.find((item) => item.id === announcementForm.id) ?? null,
    [announcements, announcementForm.id],
  );

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [announcementResponse, maintenanceResponse, organizationResponse] = await Promise.all([
        listSystemAnnouncements(),
        getSystemMaintenance(),
        listSuperAdminOrganizations({ page: 1, pageSize: 100 }),
      ]);
      setAnnouncements(announcementResponse.items);
      setMaintenance(maintenanceResponse);
      setMaintenanceForm(toMaintenanceForm(maintenanceResponse));
      setOrganizations(organizationResponse.items);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  async function saveAnnouncement() {
    if (!announcementForm.title.trim() || !announcementForm.message.trim() || !announcementForm.startAt) {
      setError("제목, 메시지, 시작 시간은 필수입니다.");
      return;
    }
    if (announcementForm.targetScope === "organization" && !announcementForm.targetOrganizationId) {
      setError("대상 조직을 선택해 주세요.");
      return;
    }

    setIsSavingAnnouncement(true);
    setError(null);
    try {
      const body = toAnnouncementBody(announcementForm);
      const saved = announcementForm.id
        ? await patchSystemAnnouncement(announcementForm.id, body as SuperAdminAnnouncementPatchRequest)
        : await createSystemAnnouncement(body);
      setAnnouncementForm(toAnnouncementForm(saved));
      setMessage(announcementForm.id ? "공지사항이 수정되었습니다." : "공지사항이 생성되었습니다.");
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingAnnouncement(false);
    }
  }

  async function toggleAnnouncement(row: SuperAdminAnnouncementItem, isActive: boolean) {
    try {
      setError(null);
      await patchSystemAnnouncement(row.id, { isActive });
      setMessage(isActive ? "공지사항이 활성화되었습니다." : "공지사항이 비활성화되었습니다.");
      await load();
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    }
  }

  async function saveMaintenance() {
    if (!maintenanceForm.message.trim() || !maintenanceForm.startAt) {
      setError("점검 메시지와 시작 시간은 필수입니다.");
      return;
    }

    setIsSavingMaintenance(true);
    setError(null);
    try {
      const saved = await upsertSystemMaintenance(toMaintenanceBody(maintenanceForm));
      setMaintenance(saved);
      setMaintenanceForm(toMaintenanceForm(saved));
      setMessage(saved.isActive ? "점검 모드가 수정되었습니다." : "점검 모드가 비활성 상태로 저장되었습니다.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingMaintenance(false);
    }
  }

  async function disableMaintenanceNow() {
    try {
      setError(null);
      const saved = await disableSystemMaintenance();
      setMaintenance(saved);
      setMaintenanceForm(toMaintenanceForm(saved));
      setMessage("점검 모드가 비활성화되었습니다.");
    } catch (disableError) {
      setError(getErrorMessage(disableError));
    }
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <PagePanel title="공지사항 관리" description="전체 또는 조직별 공지사항을 기간과 함께 등록합니다.">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={6}>
                      Loading announcements...
                    </td>
                  </tr>
                ) : announcements.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={6}>
                      No announcements found.
                    </td>
                  </tr>
                ) : (
                  announcements.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">{item.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-500">{item.message}</div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={announcementTone(item.type)}>{item.type}</StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {item.targetScope === "global" ? "Global" : item.targetOrganizationName ?? item.targetOrganizationId}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {new Date(item.startAt).toLocaleString("ko-KR")}
                        <br />
                        {item.endAt ? new Date(item.endAt).toLocaleString("ko-KR") : "No end"}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{item.isActive ? "active" : "inactive"}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setAnnouncementForm(toAnnouncementForm(item))}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleAnnouncement(item, !item.isActive)}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                          >
                            {item.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {announcementForm.id ? "Edit Announcement" : "New Announcement"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">Announcements are visible only during the active time window.</p>
              </div>
              {selectedAnnouncement ? (
                <StatusBadge tone={selectedAnnouncement.isActive ? "success" : "default"}>
                  {selectedAnnouncement.isActive ? "active" : "inactive"}
                </StatusBadge>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Title</span>
                <input
                  value={announcementForm.title}
                  onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Message</span>
                <textarea
                  value={announcementForm.message}
                  onChange={(event) => setAnnouncementForm((current) => ({ ...current, message: event.target.value }))}
                  rows={5}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Type</span>
                  <select
                    value={announcementForm.type}
                    onChange={(event) =>
                      setAnnouncementForm((current) => ({
                        ...current,
                        type: event.target.value as PublicAnnouncementType,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="critical">critical</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Target Scope</span>
                  <select
                    value={announcementForm.targetScope}
                    onChange={(event) =>
                      setAnnouncementForm((current) => ({
                        ...current,
                        targetScope: event.target.value as "global" | "organization",
                        targetOrganizationId: event.target.value === "organization" ? current.targetOrganizationId : "",
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    <option value="global">global</option>
                    <option value="organization">organization</option>
                  </select>
                </label>
              </div>
              {announcementForm.targetScope === "organization" ? (
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Target Organization</span>
                  <select
                    value={announcementForm.targetOrganizationId}
                    onChange={(event) =>
                      setAnnouncementForm((current) => ({ ...current, targetOrganizationId: event.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    <option value="">Select organization</option>
                    {organizations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Start</span>
                  <input
                    type="datetime-local"
                    value={announcementForm.startAt}
                    onChange={(event) => setAnnouncementForm((current) => ({ ...current, startAt: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">End</span>
                  <input
                    type="datetime-local"
                    value={announcementForm.endAt}
                    onChange={(event) => setAnnouncementForm((current) => ({ ...current, endAt: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={announcementForm.isActive}
                  onChange={(event) => setAnnouncementForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Active
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => void saveAnnouncement()}
                disabled={isSavingAnnouncement}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSavingAnnouncement ? "Saving..." : "Save Announcement"}
              </button>
            </div>
          </div>
        </div>
      </PagePanel>

      <PagePanel title="점검 모드" description="읽기 전용, 전체 차단, 부분 점검 규칙을 관리합니다.">
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Current State</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <p>Status: {maintenance?.isActive ? "active" : "inactive"}</p>
              <p>Mode: {maintenance?.mode ?? "-"}</p>
              <p>Message: {maintenance?.message || "-"}</p>
              <p>Allowed paths: {(maintenance?.allowedPaths ?? []).length}</p>
              <p>Start: {maintenance?.startAt ? new Date(maintenance.startAt).toLocaleString("ko-KR") : "-"}</p>
              <p>End: {maintenance?.endAt ? new Date(maintenance.endAt).toLocaleString("ko-KR") : "No end"}</p>
            </div>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void disableMaintenanceNow()}
                className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700"
              >
                Disable Maintenance
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Update Maintenance</h3>
            <div className="mt-5 grid gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={maintenanceForm.isActive}
                  onChange={(event) => setMaintenanceForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Enable maintenance mode
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Mode</span>
                <select
                  value={maintenanceForm.mode}
                  onChange={(event) =>
                    setMaintenanceForm((current) => ({ ...current, mode: event.target.value as MaintenanceMode }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="read_only">read_only</option>
                  <option value="block_all">block_all</option>
                  <option value="partial">partial</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Message</span>
                <textarea
                  value={maintenanceForm.message}
                  onChange={(event) => setMaintenanceForm((current) => ({ ...current, message: event.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Allowed Paths</span>
                <textarea
                  value={maintenanceForm.allowedPathsText}
                  onChange={(event) =>
                    setMaintenanceForm((current) => ({ ...current, allowedPathsText: event.target.value }))
                  }
                  rows={5}
                  placeholder={"/api/public\n/api/health\n/api/admin/auth"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Start</span>
                  <input
                    type="datetime-local"
                    value={maintenanceForm.startAt}
                    onChange={(event) => setMaintenanceForm((current) => ({ ...current, startAt: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">End</span>
                  <input
                    type="datetime-local"
                    value={maintenanceForm.endAt}
                    onChange={(event) => setMaintenanceForm((current) => ({ ...current, endAt: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void saveMaintenance()}
                disabled={isSavingMaintenance}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSavingMaintenance ? "Saving..." : "Save Maintenance"}
              </button>
            </div>
          </div>
        </div>
      </PagePanel>
    </div>
  );
}
