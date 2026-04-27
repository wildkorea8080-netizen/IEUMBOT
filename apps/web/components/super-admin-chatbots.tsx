"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  activateSuperAdminChatbot,
  getSuperAdminChatbot,
  listSuperAdminChatbots,
  suspendSuperAdminChatbot,
} from "../lib/api/super-admin-chatbots";
import type {
  SuperAdminChatbotDetailResponse,
  SuperAdminChatbotListItem,
  SuperAdminChatbotStatus,
} from "../lib/api/super-admin-chatbots-types";
import { listSuperAdminOrganizations } from "../lib/api/super-admin-organizations";
import type { SuperAdminOrganizationListItem } from "../lib/api/super-admin-organizations-types";
import { listSuperAdminWidgetsByOrganization } from "../lib/api/super-admin-widgets";
import { AdminDrawer } from "./ui/admin-drawer";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type ChatbotRow = SuperAdminChatbotListItem & {
  organizationName: string;
  widgetCount: number;
};

type ChatbotWidgetSummary = {
  id: string;
  chatbotId: string;
  allowedDomains: string[];
  status: string;
  createdAt: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "챗봇 요청에 실패했습니다.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function toneForStatus(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "active") return "success";
  if (status === "inactive") return "info";
  if (status === "suspended") return "warning";
  return "danger";
}

function statusLabel(status: string): string {
  if (status === "active") return "활성";
  if (status === "inactive") return "비활성";
  if (status === "suspended") return "정지";
  return status;
}

export function SuperAdminChatbots() {
  const [organizations, setOrganizations] = useState<SuperAdminOrganizationListItem[]>([]);
  const [rows, setRows] = useState<ChatbotRow[]>([]);
  const [widgetsByChatbot, setWidgetsByChatbot] = useState<Record<string, ChatbotWidgetSummary[]>>({});
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<SuperAdminChatbotStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SuperAdminChatbotDetailResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
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
        setWarning(`MVP 제한으로 ${orgResponse.total}개 중 ${orgResponse.items.length}개 기관만 불러왔습니다.`);
      }

      const grouped = await Promise.all(
        orgResponse.items.map(async (organization) => {
          const [chatbotsResponse, widgetsResponse] = await Promise.all([
            listSuperAdminChatbots(organization.id),
            listSuperAdminWidgetsByOrganization(organization.id),
          ]);

          const widgetMap = new Map<string, ChatbotWidgetSummary[]>();
          widgetsResponse.items.forEach((widget) => {
            const current = widgetMap.get(widget.chatbotId) ?? [];
            current.push({
              id: widget.id,
              chatbotId: widget.chatbotId,
              allowedDomains: widget.allowedDomains,
              status: widget.status,
              createdAt: widget.createdAt,
            });
            widgetMap.set(widget.chatbotId, current);
          });

          return {
            organization,
            chatbots: chatbotsResponse.items.map((chatbot) => ({
              ...chatbot,
              organizationName: organization.name,
              widgetCount: widgetMap.get(chatbot.id)?.length ?? 0,
            })),
            widgets: widgetMap,
          };
        }),
      );

      const nextRows = grouped.flatMap((item) => item.chatbots).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const nextWidgetsByChatbot: Record<string, ChatbotWidgetSummary[]> = {};
      grouped.forEach((item) => {
        item.widgets.forEach((value, key) => {
          nextWidgetsByChatbot[key] = value;
        });
      });

      setRows(nextRows);
      setWidgetsByChatbot(nextWidgetsByChatbot);
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
        row.organizationName.toLowerCase().includes(normalizedQuery);
      const matchesOrganization = organizationFilter === "all" || row.organizationId === organizationFilter;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesQuery && matchesOrganization && matchesStatus;
    });
  }, [rows, query, organizationFilter, statusFilter]);

  async function openDetail(chatbotId: string) {
    setSelectedId(chatbotId);
    setDrawerOpen(true);
    setIsDetailLoading(true);
    setError(null);
    try {
      const detail = await getSuperAdminChatbot(chatbotId);
      setSelectedDetail(detail);
    } catch (detailError) {
      setError(getErrorMessage(detailError));
      setSelectedDetail(null);
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function changeStatus(chatbotId: string, action: "activate" | "suspend") {
    const confirmed = window.confirm(
      action === "activate" ? "이 챗봇을 활성화하시겠습니까?" : "이 챗봇을 정지하시겠습니까?",
    );
    if (!confirmed) return;

    try {
      const detail =
        action === "activate"
          ? await activateSuperAdminChatbot(chatbotId)
          : await suspendSuperAdminChatbot(chatbotId);
      setRows((current) =>
        current.map((item) =>
          item.id === chatbotId ? { ...item, status: detail.status, widgetCount: detail.widgetCount } : item,
        ),
      );
      if (selectedId === chatbotId) setSelectedDetail(detail);
      setMessage(action === "activate" ? "챗봇을 활성화했습니다." : "챗봇을 정지했습니다.");
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    }
  }

  const selectedWidgets = selectedId ? widgetsByChatbot[selectedId] ?? [] : [];

  return (
    <div className="space-y-6">
      <PagePanel title="챗봇 관리" description="챗봇 상태, 사용 리소스, 연결된 위젯을 확인합니다.">
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
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="기관 또는 챗봇 검색"
            className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={organizationFilter}
            onChange={(event) => setOrganizationFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 기관</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SuperAdminChatbotStatus | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
            <option value="suspended">정지</option>
          </select>
          <button
            type="button"
            onClick={() => setQuery(queryInput)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            검색
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {isLoading ? "챗봇을 불러오는 중..." : `총 ${filteredRows.length}개 챗봇`}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-3">챗봇</th>
                <th className="px-3 py-3">기관</th>
                <th className="px-3 py-3">상태</th>
                <th className="px-3 py-3">문서</th>
                <th className="px-3 py-3">웹사이트</th>
                <th className="px-3 py-3">위젯</th>
                <th className="px-3 py-3">최근 학습</th>
                <th className="px-3 py-3">생성일</th>
                <th className="px-3 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    챗봇이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-3 py-3">{row.organizationName}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={toneForStatus(row.status)}>{statusLabel(row.status)}</StatusBadge>
                    </td>
                    <td className="px-3 py-3">{row.documentCount}</td>
                    <td className="px-3 py-3">{row.websiteCount}</td>
                    <td className="px-3 py-3">{row.widgetCount}</td>
                    <td className="px-3 py-3">{formatDateTime(row.lastTrainedAt)}</td>
                    <td className="px-3 py-3">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void openDetail(row.id)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                        >
                          상세
                        </button>
                        <button
                          type="button"
                          onClick={() => void changeStatus(row.id, "activate")}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                        >
                          활성화
                        </button>
                        <button
                          type="button"
                          onClick={() => void changeStatus(row.id, "suspend")}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                        >
                          정지
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

      <AdminDrawer
        open={drawerOpen}
        title={selectedDetail?.name ?? "챗봇 상세"}
        description="설정과 연결된 위젯을 확인합니다."
        onClose={() => {
          setDrawerOpen(false);
          setSelectedId(null);
          setSelectedDetail(null);
        }}
      >
        {isDetailLoading ? <p className="text-sm text-slate-500">챗봇 상세 정보를 불러오는 중...</p> : null}
        {!isDetailLoading && selectedDetail ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">상태</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{statusLabel(selectedDetail.status)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">문서</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedDetail.documentCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">웹사이트</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedDetail.websiteCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">위젯</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedDetail.widgetCount}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-900">설정 요약</h4>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <p>답변 템플릿: {selectedDetail.settings.answerTemplateMode ?? "-"}</p>
                <p>출처 표시: {selectedDetail.settings.citationDisplayMode ?? "-"}</p>
                <p>출처 필수: {String(selectedDetail.settings.requireCitations ?? "-")}</p>
                <p>근거 필수: {String(selectedDetail.settings.disallowAnswerWithoutEvidence ?? "-")}</p>
                <p>모델: {selectedDetail.settings.modelName ?? "-"}</p>
                <p>수정일: {formatDateTime(selectedDetail.updatedAt)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-900">연결된 위젯</h4>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2">위젯 ID</th>
                      <th className="px-3 py-2">상태</th>
                      <th className="px-3 py-2">허용 도메인</th>
                      <th className="px-3 py-2">생성일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedWidgets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                          연결된 위젯이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      selectedWidgets.map((widget) => (
                        <tr key={widget.id} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{widget.id}</td>
                          <td className="px-3 py-2">{statusLabel(widget.status)}</td>
                          <td className="px-3 py-2">{widget.allowedDomains.join(", ") || "-"}</td>
                          <td className="px-3 py-2">{formatDateTime(widget.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </AdminDrawer>
    </div>
  );
}
