"use client";

import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../ui/page-panel";
import { ApiClientError } from "../../lib/api";
import { getAdminAuditLogDetail, getAdminAuditLogs } from "../../lib/api/audit-logs";
import type {
  AdminAuditLogDetail,
  AdminAuditLogItem,
} from "../../lib/api/audit-logs-types";

const TEXT = {
  title: "Audit 로그",
  description: "기관관리자 권한 범위에서 발생한 주요 운영 이력을 조회합니다.",
  loading: "Audit 로그를 불러오는 중입니다.",
  empty: "조회된 Audit 로그가 없습니다.",
  error: "Audit 로그를 불러오는 중 오류가 발생했습니다.",
  search: "조회",
  allActions: "전체 액션",
  login: "로그인",
  knowledge: "지식 등록",
  settings: "설정 변경",
  chatbot: "챗봇 변경",
  widget: "위젯 생성",
  contract: "계약 변경",
  time: "시간",
  admin: "관리자",
  action: "액션",
  target: "대상",
  result: "결과",
  detail: "상세",
  close: "닫기",
  detailTitle: "Audit 로그 상세",
  detailDescription: "민감정보와 전체 metadata JSON은 기본 노출하지 않습니다.",
  metadata: "metadata 요약",
  noMetadata: "표시할 metadata 요약이 없습니다.",
  success: "success",
  fail: "fail",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return TEXT.error;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function resultBadgeClass(result: string): string {
  if (result === "success") return "bg-emerald-100 text-emerald-700";
  if (result === "fail" || result === "blocked") return "bg-rose-100 text-rose-700";
  return "bg-slate-200 text-slate-700";
}

function targetLabel(item: AdminAuditLogItem | AdminAuditLogDetail): string {
  if (!item.targetType && !item.targetId) return "-";
  return `${item.targetType ?? "target"} / ${item.targetId ?? "-"}`;
}

export function AuditLogPage() {
  const [items, setItems] = useState<AdminAuditLogItem[]>([]);
  const [detail, setDetail] = useState<AdminAuditLogDetail | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [actionType, setActionType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [pageSize, totalCount]);

  async function loadLogs(nextPage = page) {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAdminAuditLogs({
        from: from || undefined,
        to: to || undefined,
        adminEmail: adminEmail.trim() || undefined,
        actionType: actionType || undefined,
        page: nextPage,
        pageSize,
      });
      setItems(response.items);
      setTotalCount(response.totalCount);
      setPage(response.page);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(1);
  }, []);

  async function openDetail(logId: string) {
    setIsDetailLoading(true);
    setError(null);
    try {
      const response = await getAdminAuditLogDetail(logId);
      setDetail(response);
    } catch (detailError) {
      setError(getErrorMessage(detailError));
    } finally {
      setIsDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel title={TEXT.title} description={TEXT.description}>
        <div className="grid gap-3 lg:grid-cols-[160px_160px_220px_180px_auto]">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="관리자 이메일 검색" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={actionType} onChange={(event) => setActionType(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">{TEXT.allActions}</option>
            <option value="login">{TEXT.login}</option>
            <option value="knowledge">{TEXT.knowledge}</option>
            <option value="settings">{TEXT.settings}</option>
            <option value="chatbot">{TEXT.chatbot}</option>
            <option value="widget">{TEXT.widget}</option>
            <option value="contract">{TEXT.contract}</option>
          </select>
          <button type="button" onClick={() => void loadLogs(1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            {TEXT.search}
          </button>
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {isLoading ? <p className="mt-4 text-sm text-slate-500">{TEXT.loading}</p> : null}

        {!isLoading ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="w-44 px-3 py-3">{TEXT.time}</th>
                  <th className="w-52 px-3 py-3">{TEXT.admin}</th>
                  <th className="px-3 py-3">{TEXT.action}</th>
                  <th className="w-64 px-3 py-3">{TEXT.target}</th>
                  <th className="w-28 px-3 py-3">{TEXT.result}</th>
                  <th className="w-24 px-3 py-3">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">{TEXT.empty}</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.logId}>
                      <td className="px-3 py-4 text-slate-500">{formatDateTime(item.time)}</td>
                      <td className="px-3 py-4 text-slate-700">
                        <p className="font-medium text-slate-900">{item.adminName ?? "-"}</p>
                        <p className="text-xs text-slate-500">{item.adminEmail ?? "-"}</p>
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        <p className="font-medium text-slate-900">{item.actionLabel}</p>
                        <p className="text-xs text-slate-500">{item.action}</p>
                      </td>
                      <td className="px-3 py-4 text-slate-700">{targetLabel(item)}</td>
                      <td className="px-3 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${resultBadgeClass(item.result)}`}>
                          {item.result}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <button type="button" onClick={() => void openDetail(item.logId)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700">
                          {TEXT.detail}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Total {totalCount} / Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => void loadLogs(page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">
              Prev
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => void loadLogs(page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </PagePanel>

      {(detail || isDetailLoading) && (
        <div className="fixed inset-0 z-40 bg-slate-950/30">
          <div className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{TEXT.detailTitle}</h3>
                <p className="text-sm text-slate-500">{TEXT.detailDescription}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                {TEXT.close}
              </button>
            </div>

            {isDetailLoading ? <p className="px-6 py-8 text-sm text-slate-500">{TEXT.loading}</p> : null}

            {detail ? (
              <div className="space-y-6 px-6 py-6">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
                  <div><strong className="mr-2 text-slate-900">{TEXT.time}</strong>{formatDateTime(detail.time)}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.result}</strong>{detail.result}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.admin}</strong>{detail.adminEmail ?? "-"}</div>
                  <div><strong className="mr-2 text-slate-900">{TEXT.target}</strong>{targetLabel(detail)}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">{TEXT.action}</h4>
                  <p className="mt-2 text-sm text-slate-900">{detail.actionLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">{detail.action}</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">{TEXT.metadata}</h4>
                  {Object.keys(detail.metadataSummary).length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">{TEXT.noMetadata}</p>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {Object.entries(detail.metadataSummary).map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <p className="font-medium text-slate-900">{key}</p>
                          <p className="mt-1 break-all">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

