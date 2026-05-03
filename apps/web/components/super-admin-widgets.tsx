"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import { getSuperAdminChatbot, listAllSuperAdminChatbots } from "../lib/api/super-admin-chatbots";
import type {
  SuperAdminChatbotDetailResponse,
  SuperAdminChatbotListItem,
} from "../lib/api/super-admin-chatbots-types";
import { listSuperAdminOrganizations } from "../lib/api/super-admin-organizations";
import type { SuperAdminOrganizationListItem } from "../lib/api/super-admin-organizations-types";
import {
  createSuperAdminWidget,
  listSuperAdminWidgets,
  patchSuperAdminWidget,
} from "../lib/api/super-admin-widgets";
import type {
  SuperAdminWidgetItem,
  WidgetPosition,
} from "../lib/api/super-admin-widgets-types";
import { AdminDrawer } from "./ui/admin-drawer";
import { AdminModal } from "./ui/admin-modal";
import { CopyButton } from "./ui/copy-button";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type WidgetRow = SuperAdminWidgetItem & {
  organizationName: string;
  chatbotName: string;
  installScriptText: string;
};

type WidgetFormState = {
  organizationId: string;
  chatbotId: string;
  allowedDomains: string;
  themeColor: string;
  launcherLabel: string;
  welcomeMessage: string;
  position: WidgetPosition;
  isActive: boolean;
};

type EditorState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      widgetId: string;
    };

const EMPTY_FORM: WidgetFormState = {
  organizationId: "",
  chatbotId: "",
  allowedDomains: "localhost",
  themeColor: "#0f172a",
  launcherLabel: "",
  welcomeMessage: "",
  position: "bottom-right",
  isActive: true,
};

const DEFAULT_WIDGET_API_BASE_URL = "/backend-api";

function buildInstallScript(chatbotId: string): string {
  return [
    "<script",
    '  src="/widget.js"',
    `  data-chatbot-id="${chatbotId}"`,
    `  data-api-base-url="${DEFAULT_WIDGET_API_BASE_URL}"`,
    '  data-open-on-load="false"',
    "></script>",
  ].join("\n");
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function toDomainsArray(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isValidDomain(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "localhost") return true;

  try {
    const parsed = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
    const hostname = parsed.hostname.trim().toLowerCase();
    return hostname === "localhost" || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostname);
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown, fallback = "요청을 처리하지 못했습니다."): string {
  if (error instanceof ApiClientError) {
    if (error.code === "HTTP_403") return "수정 권한이 없습니다.";
    if (error.code === "INVALID_WIDGET_POSITION") {
      return "위치는 bottom-right 또는 bottom-left만 사용할 수 있습니다.";
    }
    if (error.code === "ALLOWED_DOMAINS_REQUIRED") return "허용 도메인을 1개 이상 입력해 주세요.";
    if (error.code === "INVALID_ALLOWED_DOMAIN") return "허용 도메인 형식이 올바르지 않습니다.";
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

function toneForStatus(status: string): "success" | "warning" {
  return status === "active" ? "success" : "warning";
}

export function SuperAdminWidgets() {
  const [organizations, setOrganizations] = useState<SuperAdminOrganizationListItem[]>([]);
  const [chatbots, setChatbots] = useState<SuperAdminChatbotListItem[]>([]);
  const [rows, setRows] = useState<WidgetRow[]>([]);
  const [queryOrgInput, setQueryOrgInput] = useState("");
  const [queryBotInput, setQueryBotInput] = useState("");
  const [organizationQuery, setOrganizationQuery] = useState("");
  const [chatbotQuery, setChatbotQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<WidgetFormState>(EMPTY_FORM);
  const [selectedChatbotDetail, setSelectedChatbotDetail] =
    useState<SuperAdminChatbotDetailResponse | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
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
      const [orgResponse, chatbotResponse, widgetResponse] = await Promise.all([
        listSuperAdminOrganizations({ page: 1, pageSize: 100 }),
        listAllSuperAdminChatbots(),
        listSuperAdminWidgets(),
      ]);

      setOrganizations(orgResponse.items);
      setChatbots(chatbotResponse.items);

      if (orgResponse.total > orgResponse.items.length) {
        setWarning(`기관 ${orgResponse.total}개 중 ${orgResponse.items.length}개만 불러왔습니다.`);
      }

      const organizationMap = new Map(orgResponse.items.map((item) => [item.id, item.name]));
      const chatbotMap = new Map(chatbotResponse.items.map((item) => [item.id, item]));
      const nextRows = widgetResponse.items
        .map((widget) => {
          const chatbot = chatbotMap.get(widget.chatbotId);
          return {
            ...widget,
            organizationName: organizationMap.get(widget.organizationId) ?? widget.organizationId,
            chatbotName: chatbot?.name ?? widget.chatbotId,
            installScriptText: widget.installScript ?? buildInstallScript(widget.chatbotId),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setRows(nextRows);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setRows([]);
      setChatbots([]);
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

  const filteredChatbots = useMemo(
    () => chatbots.filter((item) => !form.organizationId || item.organizationId === form.organizationId),
    [chatbots, form.organizationId],
  );

  const filteredRows = useMemo(() => {
    const normalizedOrg = organizationQuery.trim().toLowerCase();
    const normalizedBot = chatbotQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesOrg = !normalizedOrg || row.organizationName.toLowerCase().includes(normalizedOrg);
      const matchesBot = !normalizedBot || row.chatbotName.toLowerCase().includes(normalizedBot);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesOrg && matchesBot && matchesStatus;
    });
  }, [rows, organizationQuery, chatbotQuery, statusFilter]);

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      organizationId: organizations[0]?.id ?? "",
    });
    setEditor({ mode: "create" });
  }

  function openEdit(row: WidgetRow) {
    setForm({
      organizationId: row.organizationId,
      chatbotId: row.chatbotId,
      allowedDomains: row.allowedDomains.join(", "),
      themeColor: row.themeColor ?? "#0f172a",
      launcherLabel: row.launcherLabel ?? "",
      welcomeMessage: row.welcomeMessage ?? "",
      position: row.position,
      isActive: row.isActive,
    });
    setEditor({ mode: "edit", widgetId: row.id });
  }

  async function saveWidget() {
    if (!editor) return;

    if (!form.organizationId) {
      setError("기관을 선택해 주세요.");
      return;
    }
    if (!form.chatbotId) {
      setError("챗봇을 선택해 주세요.");
      return;
    }

    const allowedDomains = toDomainsArray(form.allowedDomains);
    if (allowedDomains.length === 0) {
      setError("허용 도메인을 1개 이상 입력해 주세요.");
      return;
    }
    if (allowedDomains.some((item) => !isValidDomain(item))) {
      setError("허용 도메인 형식이 올바르지 않습니다.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (editor.mode === "create") {
        const created = await createSuperAdminWidget({
          chatbotId: form.chatbotId,
          allowedDomains,
          themeColor: form.themeColor.trim() || null,
          launcherLabel: form.launcherLabel.trim() || null,
          welcomeMessage: form.welcomeMessage.trim() || null,
          position: form.position,
        });
        if (!form.isActive) {
          await patchSuperAdminWidget(created.widgetId, { isActive: false });
        }
        setMessage("위젯이 생성되었습니다.");
      } else {
        await patchSuperAdminWidget(editor.widgetId, {
          allowedDomains,
          themeColor: form.themeColor.trim() || null,
          launcherLabel: form.launcherLabel.trim() || null,
          welcomeMessage: form.welcomeMessage.trim() || null,
          position: form.position,
          isActive: form.isActive,
        });
        setMessage("위젯이 수정되었습니다.");
      }

      await loadData();
      setEditor(null);
    } catch (saveError) {
      const fallback = editor.mode === "edit" ? "위젯 수정에 실패했습니다." : "위젯 생성에 실패했습니다.";
      setError(getErrorMessage(saveError, fallback));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleWidget(row: WidgetRow, nextActive: boolean) {
    const confirmed = window.confirm(nextActive ? "위젯을 활성화하시겠습니까?" : "위젯을 비활성화하시겠습니까?");
    if (!confirmed) return;

    try {
      await patchSuperAdminWidget(row.id, { isActive: nextActive });
      await loadData();
      setMessage(nextActive ? "위젯이 활성화되었습니다." : "위젯이 비활성화되었습니다.");
    } catch (actionError) {
      setError(getErrorMessage(actionError, "위젯 상태 변경에 실패했습니다."));
    }
  }

  async function openChatbotDetail(chatbotId: string) {
    setDetailOpen(true);
    setSelectedChatbotDetail(null);
    setError(null);
    try {
      const detail = await getSuperAdminChatbot(chatbotId);
      setSelectedChatbotDetail(detail);
    } catch (detailError) {
      setError(getErrorMessage(detailError));
    }
  }

  const isEditMode = editor?.mode === "edit";

  return (
    <div className="space-y-6">
      <PagePanel
        title="위젯 관리"
        description="위젯 배포 상태와 허용 도메인, 표시 설정을 관리합니다."
      >
        {message ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {warning ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {warning}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={queryOrgInput}
            onChange={(event) => setQueryOrgInput(event.target.value)}
            placeholder="기관 검색"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={queryBotInput}
            onChange={(event) => setQueryBotInput(event.target.value)}
            placeholder="챗봇 검색"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setOrganizationQuery(queryOrgInput);
              setChatbotQuery(queryBotInput);
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            검색
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            위젯 생성
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {isLoading ? "위젯을 불러오는 중..." : `총 ${filteredRows.length}개 위젯`}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[1480px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-3">위젯</th>
                <th className="px-3 py-3">기관</th>
                <th className="px-3 py-3">챗봇</th>
                <th className="px-3 py-3">상태</th>
                <th className="px-3 py-3">허용 도메인</th>
                <th className="px-3 py-3">색상</th>
                <th className="px-3 py-3">런처 라벨</th>
                <th className="px-3 py-3">위치</th>
                <th className="px-3 py-3">생성일</th>
                <th className="px-3 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-slate-500">
                    위젯이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{row.id}</td>
                    <td className="px-3 py-3">{row.organizationName}</td>
                    <td className="px-3 py-3">{row.chatbotName}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={toneForStatus(row.status)}>
                        {row.status === "active" ? "활성" : "비활성"}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-3">{row.allowedDomains.join(", ") || "-"}</td>
                    <td className="px-3 py-3">{row.themeColor ?? "-"}</td>
                    <td className="px-3 py-3">{row.launcherLabel ?? "-"}</td>
                    <td className="px-3 py-3">{row.position}</td>
                    <td className="px-3 py-3">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleWidget(row, !row.isActive)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                        >
                          {row.isActive ? "비활성화" : "활성화"}
                        </button>
                        <CopyButton
                          text={row.installScriptText}
                          label="스크립트 복사"
                          onCopied={(nextMessage, tone) => {
                            if (tone === "success") {
                              setMessage(nextMessage);
                              setError(null);
                            } else {
                              setError(nextMessage);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void openChatbotDetail(row.chatbotId)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                        >
                          챗봇 상세
                        </button>
                        <Link
                          href="/super-admin/organizations"
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                        >
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
        open={editor !== null}
        title={isEditMode ? "위젯 수정" : "위젯 생성"}
        description={
          isEditMode
            ? "허용 도메인과 표시 설정을 수정합니다."
            : "챗봇에 연결할 새 위젯 배포를 생성합니다."
        }
        onClose={() => setEditor(null)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">기관</span>
            <select
              value={form.organizationId}
              disabled={isEditMode}
              onChange={(event) =>
                setForm((current) => ({ ...current, organizationId: event.target.value, chatbotId: "" }))
              }
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

          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">챗봇</span>
            <select
              value={form.chatbotId}
              disabled={isEditMode}
              onChange={(event) => setForm((current) => ({ ...current, chatbotId: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
            >
              <option value="">챗봇 선택</option>
              {filteredChatbots.map((chatbot) => (
                <option key={chatbot.id} value={chatbot.id}>
                  {chatbot.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">허용 도메인</span>
            <input
              value={form.allowedDomains}
              onChange={(event) => setForm((current) => ({ ...current, allowedDomains: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">테마 색상</span>
            <input
              value={form.themeColor}
              onChange={(event) => setForm((current) => ({ ...current, themeColor: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">런처 라벨</span>
            <input
              value={form.launcherLabel}
              onChange={(event) => setForm((current) => ({ ...current, launcherLabel: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">웰컴 메시지</span>
            <textarea
              value={form.welcomeMessage}
              onChange={(event) => setForm((current) => ({ ...current, welcomeMessage: event.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">위치</span>
            <select
              value={form.position}
              onChange={(event) =>
                setForm((current) => ({ ...current, position: event.target.value as WidgetPosition }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="bottom-right">bottom-right</option>
              <option value="bottom-left">bottom-left</option>
            </select>
          </label>

          <label className="flex items-center gap-2 self-end text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            활성 상태로 저장
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditor(null)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void saveWidget()}
            disabled={isSaving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </AdminModal>

      <AdminDrawer
        open={detailOpen}
        title={selectedChatbotDetail?.name ?? "챗봇 상세"}
        description="위젯에 연결된 챗봇 요약입니다."
        onClose={() => setDetailOpen(false)}
      >
        {!selectedChatbotDetail ? (
          <p className="text-sm text-slate-500">챗봇 상세 정보를 불러오는 중...</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">상태</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{selectedChatbotDetail.status}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">문서</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{selectedChatbotDetail.documentCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">웹사이트</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{selectedChatbotDetail.websiteCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">위젯</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{selectedChatbotDetail.widgetCount}</p>
            </div>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
