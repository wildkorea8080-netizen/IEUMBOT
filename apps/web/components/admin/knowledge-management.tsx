"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../ui/page-panel";
import { ApiClientError } from "../../lib/api";
import {
  deleteKnowledge,
  getKnowledgeDetail,
  getKnowledgeList,
  getKnowledgeRuntimeStatus,
  patchKnowledge,
  reindexKnowledge,
} from "../../lib/api/admin-operations";
import type {
  KnowledgeDetail,
  KnowledgeItem,
  KnowledgeRuntimeStatus,
  KnowledgeSourceGroup,
} from "../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "지식 정보를 처리하지 못했습니다.";
}

function effectiveStatus(item: KnowledgeItem): string {
  return item.displayStatus ?? item.status;
}

function statusClass(status: string): string {
  if (status === "completed" || status === "ready") return "bg-emerald-100 text-emerald-700";
  if (status === "failed" || status === "stale_failed") return "bg-red-100 text-red-700";
  if (status === "needs_reindex") return "bg-orange-100 text-orange-700";
  if (status === "inactive") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-700";
}

function statusLabel(status: string): string {
  if (status === "queued") return "대기 중";
  if (status === "processing") return "처리 중";
  if (status === "completed" || status === "ready") return "완료";
  if (status === "failed") return "실패";
  if (status === "stale_failed") return "처리 시간 초과";
  if (status === "needs_reindex") return "재색인 필요";
  if (status === "inactive") return "비활성";
  return status;
}

function sourceTypeLabel(sourceType: string): string {
  if (sourceType === "text") return "텍스트";
  if (sourceType === "website") return "웹사이트";
  return "파일";
}

function extractionMethodLabel(method?: string | null): string {
  if (method === "text") return "text";
  if (method === "ocr") return "ocr";
  if (method === "failed") return "failed";
  return "-";
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCount(value?: number | null): string {
  return typeof value === "number" ? value.toLocaleString("ko-KR") : "0";
}

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

function getDiagnosticWarnings(item: KnowledgeItem): string[] {
  // Prefer server-computed healthWarnings, supplement with client-side checks.
  const warnings: string[] = [...(item.healthWarnings ?? [])];
  const createdAt = new Date(item.createdAt).getTime();
  const ds = effectiveStatus(item);

  if (item.recoveryAction === "completed_from_existing_chunks" && !warnings.some((w) => w.includes("복구"))) {
    warnings.push("기존 청크/임베딩 기준으로 상태를 완료로 복구했습니다.");
  }
  if (item.recoveryAction === "failed_stale" && !warnings.some((w) => w.includes("초과"))) {
    warnings.push("오래된 색인 작업이 실패로 정리되었습니다.");
  }
  if (item.reindexRequired && ds !== "needs_reindex" && !warnings.some((w) => w.includes("재색인"))) {
    warnings.push("재색인이 필요합니다.");
  }
  if (ds === "queued" && Number.isFinite(createdAt) && Date.now() - createdAt > 5 * 60 * 1000) {
    warnings.push("처리 대기 상태가 오래 지속되고 있습니다.");
  }
  if ((ds === "completed" || ds === "ready") && (item.chunkCount ?? 0) === 0) {
    warnings.push("청크가 생성되지 않았습니다.");
  }
  if ((ds === "completed" || ds === "ready") && (item.embeddingCount ?? 0) === 0) {
    warnings.push("임베딩이 생성되지 않았습니다.");
  }
  if ((item.extractedTextLength ?? 0) < 300 && (item.chunkCount ?? 0) === 0) {
    warnings.push("추출된 텍스트가 너무 적습니다.");
  }
  return [...new Set(warnings)];
}

type EditorState = {
  title: string;
  category: string;
  field: string;
  tags: string;
  memo: string;
  effectiveDate: string;
  expirationDate: string;
  department: string;
  crawlPageLimit: string;
  crawlAllPages: boolean;
  includeAttachments: boolean;
  excludedPaths: string;
  isActive: boolean;
};

function toEditor(detail: KnowledgeDetail): EditorState {
  return {
    title: detail.title,
    category: detail.category ?? "",
    field: detail.field ?? "",
    tags: detail.tags.join(", "),
    memo: detail.memo ?? "",
    effectiveDate: detail.effectiveDate ?? "",
    expirationDate: detail.expirationDate ?? "",
    department: detail.department ?? "",
    crawlPageLimit: detail.crawlPageLimit ? String(detail.crawlPageLimit) : "300",
    crawlAllPages: detail.crawlAllPages ?? true,
    includeAttachments: detail.includeAttachments ?? true,
    excludedPaths: (detail.excludedPaths ?? []).join("\n"),
    isActive: detail.isActive,
  };
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function KnowledgeManagement() {
  const [sourceGroup, setSourceGroup] = useState<KnowledgeSourceGroup>("file_text");
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [field, setField] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<KnowledgeRuntimeStatus | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(),
    [items],
  );
  const fields = useMemo(
    () => Array.from(new Set(items.map((item) => item.field).filter(Boolean))).sort(),
    [items],
  );

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [response, runtime] = await Promise.all([
        getKnowledgeList({
          sourceGroup,
          q: query.trim() || undefined,
          category: category || undefined,
          field: field || undefined,
          status: status || undefined,
        }),
        getKnowledgeRuntimeStatus(),
      ]);
      setItems(response.items);
      setRuntimeStatus(runtime);
      setSelectedIds((current) => current.filter((id) => response.items.some((item) => item.id === id)));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [sourceGroup]);

  const openDetail = async (knowledgeId: string) => {
    setIsDetailLoading(true);
    setError(null);
    try {
      const response = await getKnowledgeDetail(knowledgeId);
      setDetail(response);
      setEditor(toEditor(response));
    } catch (detailError) {
      setError(getErrorMessage(detailError));
    } finally {
      setIsDetailLoading(false);
    }
  };

  const saveDetail = async (options?: { reindexAfterSave?: boolean }) => {
    if (!detail || !editor) return;
    setIsSaving(true);
    setError(null);
    setNotice(options?.reindexAfterSave ? "저장 후 재색인 중입니다..." : "저장 중입니다...");
    try {
      const response = await patchKnowledge(detail.id, {
        title: editor.title,
        category: editor.category || undefined,
        field: editor.field || undefined,
        tags: splitTags(editor.tags),
        memo: editor.memo || undefined,
        effectiveDate: editor.effectiveDate || undefined,
        expirationDate: editor.expirationDate || undefined,
        department: editor.department || undefined,
        crawlPageLimit:
          detail.sourceType === "website" && editor.crawlPageLimit
            ? Number(editor.crawlPageLimit)
            : undefined,
        crawlAllPages: detail.sourceType === "website" ? editor.crawlAllPages : undefined,
        includeAttachments: detail.sourceType === "website" ? editor.includeAttachments : undefined,
        excludedPaths: detail.sourceType === "website" ? splitLines(editor.excludedPaths) : undefined,
        isActive: editor.isActive,
      });
      const nextDetail = options?.reindexAfterSave ? await reindexKnowledge(detail.id) : response;
      setDetail(nextDetail);
      setEditor(toEditor(nextDetail));
      setNotice(options?.reindexAfterSave ? "재색인 요청됨. 상태를 새로고침해 확인하세요." : "저장되었습니다.");
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const runBulkAction = async (action: "delete" | "inactive") => {
    if (selectedIds.length === 0) return;
    setIsSaving(true);
    setError(null);
    setNotice(action === "delete" ? "선택 항목을 삭제 중입니다..." : "선택 항목을 비활성화 중입니다...");
    try {
      for (const knowledgeId of selectedIds) {
        if (action === "delete") {
          await deleteKnowledge(knowledgeId);
        } else {
          await patchKnowledge(knowledgeId, { isActive: false });
        }
      }
      setSelectedIds([]);
      setDetail(null);
      setEditor(null);
      setNotice(action === "delete" ? "선택 항목이 삭제되었습니다." : "선택 항목이 비활성화되었습니다.");
      await load();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setIsSaving(false);
    }
  };

  const performRowAction = async (
    knowledgeId: string,
    action: "toggle" | "delete" | "reindex",
    isActive?: boolean,
  ) => {
    setIsSaving(true);
    setError(null);
    if (action === "reindex") {
      setNotice("재색인 중입니다...");
    } else if (action === "delete") {
      setNotice("삭제 중입니다...");
    } else {
      setNotice(isActive ? "비활성화 중입니다..." : "활성화 중입니다...");
    }
    try {
      if (action === "toggle") {
        await patchKnowledge(knowledgeId, { isActive: !isActive });
      } else if (action === "delete") {
        await deleteKnowledge(knowledgeId);
      } else {
        const refreshed = await reindexKnowledge(knowledgeId);
        if (detail?.id === knowledgeId) {
          setDetail(refreshed);
          setEditor(toEditor(refreshed));
        }
        setNotice("재색인 요청됨. 상태를 새로고침해 확인하세요.");
        await load();
        return;
      }
      if (detail?.id === knowledgeId) {
        setDetail(null);
        setEditor(null);
      }
      if (action === "delete") {
        setNotice("삭제되었습니다.");
      } else if (action === "toggle") {
        setNotice(isActive ? "비활성화되었습니다." : "활성화되었습니다.");
      }
      await load();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(items.map((item) => item.id));
  };

  return (
    <div className="space-y-6">
      <PagePanel
        title="지식 관리"
        description="파일, 텍스트, 웹사이트 지식을 검색하고 상태, 태그, 재색인, 활성화 여부를 관리합니다."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setSourceGroup("file_text")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                sourceGroup === "file_text" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              파일 및 텍스트
            </button>
            <button
              type="button"
              onClick={() => setSourceGroup("website")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                sourceGroup === "website" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              웹사이트
            </button>
          </div>
          <Link href="/admin/knowledge/register" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white">
            지식 등록
          </Link>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[180px_180px_180px_1fr_auto]">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">전체 카테고리</option>
            {categories.map((option) => (
              <option key={option} value={option ?? ""}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={field}
            onChange={(event) => setField(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">전체 분야</option>
            {fields.map((option) => (
              <option key={option} value={option ?? ""}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">전체 상태</option>
            <option value="queued">대기 중</option>
            <option value="processing">처리 중</option>
            <option value="completed">완료</option>
            <option value="failed">실패</option>
            <option value="inactive">비활성</option>
          </select>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목, 내용, 메모 또는 태그 검색"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            검색
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={selectedIds.length === 0 || isSaving}
            onClick={() => void runBulkAction("inactive")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            선택 항목 비활성화
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0 || isSaving}
            onClick={() => void runBulkAction("delete")}
            className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
          >
            선택 항목 삭제
          </button>
          <span className="text-sm text-slate-500">선택 {selectedIds.length}건</span>
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {notice ? <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{notice}</p> : null}
        {isLoading ? <p className="mt-4 text-sm text-slate-500">목록을 불러오는 중입니다.</p> : null}

        {!isLoading ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[1280px] table-fixed text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="w-12 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedIds.length === items.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="w-28 px-3 py-3">카테고리</th>
                  <th className="w-28 px-3 py-3">분야</th>
                  <th className="px-3 py-3">제목</th>
                  <th className="w-40 px-3 py-3">태그</th>
                  <th className="w-28 px-3 py-3">상태</th>
                  <th className="w-36 px-3 py-3">텍스트 길이</th>
                  <th className="w-28 px-3 py-3">청크</th>
                  <th className="w-28 px-3 py-3">임베딩</th>
                  <th className="w-44 px-3 py-3">마지막 처리</th>
                  <th className="w-64 px-3 py-3">원본</th>
                  <th className="w-64 px-3 py-3">진단</th>
                  <th className="w-56 px-3 py-3">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-10 text-center text-sm text-slate-500">
                      조건에 맞는 지식이 없습니다.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() =>
                            setSelectedIds((current) =>
                              current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-4 text-slate-700">{item.category ?? "-"}</td>
                      <td className="px-3 py-4 text-slate-700">{item.field ?? "-"}</td>
                      <td className="px-3 py-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-slate-900">{item.title}</div>
                            {item.isWebsiteAttachment ? (
                              <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-medium text-violet-700">
                                웹사이트 첨부파일
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs leading-5 text-slate-500">{item.summary ?? "-"}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="rounded-full bg-slate-100 px-2 py-1">{sourceTypeLabel(item.sourceType)}</span>
                            {item.sourceLabel ? <span className="truncate">{item.sourceLabel}</span> : null}
                            {item.isWebsiteAttachment && item.parentWebsiteUrl ? (
                              <a
                                href={item.parentWebsiteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate text-violet-700 hover:underline"
                              >
                                원본 웹사이트
                              </a>
                            ) : null}
                            {item.sensitiveDetected ? (
                              <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700">민감</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          {item.tags.length === 0 ? <span className="text-xs text-slate-400">-</span> : null}
                          {item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="space-y-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClass(effectiveStatus(item))}`}>
                            {statusLabel(effectiveStatus(item))}
                          </span>
                          {item.canSearch ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                              검색 가능
                            </span>
                          ) : null}
                          {item.staleRecovered ? (
                            <span className="inline-flex rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-700">
                              상태 복구됨
                            </span>
                          ) : null}
                          {(item.reindexRequired || effectiveStatus(item) === "needs_reindex" || effectiveStatus(item) === "stale_failed") ? (
                            <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                              재색인 필요
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-slate-600">{formatCount(item.extractedTextLength)}</td>
                      <td className="px-3 py-4 text-slate-600">{formatCount(item.chunkCount)}</td>
                      <td className="px-3 py-4 text-slate-600">{formatCount(item.embeddingCount)}</td>
                      <td className="px-3 py-4 text-xs text-slate-500">{formatDateTime(item.lastProcessedAt ?? item.indexedAt)}</td>
                      <td className="px-3 py-4 text-xs text-slate-500">
                        <div className="max-w-64 break-all">
                          {item.fileName ?? item.sourceUrl ?? item.finalUrl ?? item.sourceLabel ?? "-"}
                        </div>
                        {item.httpStatusCode ? <div className="mt-1">HTTP {item.httpStatusCode}</div> : null}
                      </td>
                      <td className="px-3 py-4">
                        <div className="space-y-1">
                          {getDiagnosticWarnings(item).length === 0 ? <span className="text-xs text-slate-400">-</span> : null}
                          {getDiagnosticWarnings(item).map((warning) => (
                            <span
                              key={warning}
                              className="block rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700"
                            >
                              {warning}
                            </span>
                          ))}
                          {item.errorMessage ? <div className="text-xs text-red-600">{item.errorMessage}</div> : null}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void openDetail(item.id)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                          >
                            상세
                          </button>
                          <button
                            type="button"
                            onClick={() => void performRowAction(item.id, "toggle", item.isActive)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                          >
                            {item.isActive ? "비활성화" : "활성화"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void performRowAction(item.id, "reindex")}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                          >
                            재색인
                          </button>
                          <button
                            type="button"
                            onClick={() => void performRowAction(item.id, "delete")}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700"
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
        ) : null}
      </PagePanel>

      {(detail || isDetailLoading) && (
        <div className="fixed inset-0 z-40 bg-slate-950/30">
          <div className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">지식 상세</h3>
                <p className="text-sm text-slate-500">메타데이터를 수정하고 수집 상태를 관리합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setEditor(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                닫기
              </button>
            </div>

            {isDetailLoading ? <p className="px-6 py-8 text-sm text-slate-500">상세 정보를 불러오는 중입니다.</p> : null}

            {detail && editor ? (
              <div className="space-y-6 px-6 py-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">제목</span>
                    <input
                      value={editor.title}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, title: event.target.value } : current))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">카테고리</span>
                    <input
                      value={editor.category}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, category: event.target.value } : current))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">분야</span>
                    <input
                      value={editor.field}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, field: event.target.value } : current))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">담당 부서</span>
                    <input
                      value={editor.department}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, department: event.target.value } : current))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">시행일</span>
                    <input
                      type="date"
                      value={editor.effectiveDate}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, effectiveDate: event.target.value } : current))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">만료일</span>
                    <input
                      type="date"
                      value={editor.expirationDate}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, expirationDate: event.target.value } : current))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">태그</span>
                    <input
                      value={editor.tags}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, tags: event.target.value } : current))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">메모</span>
                    <textarea
                      value={editor.memo}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, memo: event.target.value } : current))
                      }
                      rows={4}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <div>
                    <strong className="mr-2 text-slate-900">OCR 준비 상태</strong>
                    {runtimeStatus ? (runtimeStatus.scannedPdfReady ? "스캔 PDF 처리 가능" : "스캔 PDF 처리 미완료") : "-"}
                  </div>
                  {detail.sourceType === "website" ? (
                    <>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">크롤링 페이지 수</span>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={editor.crawlPageLimit}
                          onChange={(event) =>
                            setEditor((current) =>
                              current ? { ...current, crawlPageLimit: event.target.value } : current,
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={editor.crawlAllPages}
                          onChange={(event) =>
                            setEditor((current) =>
                              current ? { ...current, crawlAllPages: event.target.checked } : current,
                            )
                          }
                        />
                        <span className="text-sm font-medium text-slate-700">같은 도메인의 하위 페이지 전체 수집</span>
                      </label>
                      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={editor.includeAttachments}
                          onChange={(event) =>
                            setEditor((current) =>
                              current ? { ...current, includeAttachments: event.target.checked } : current,
                            )
                          }
                        />
                        <span className="text-sm font-medium text-slate-700">링크된 PDF/문서 첨부파일도 색인</span>
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className="text-sm font-medium text-slate-700">제외 경로</span>
                        <textarea
                          value={editor.excludedPaths}
                          onChange={(event) =>
                            setEditor((current) =>
                              current ? { ...current, excludedPaths: event.target.value } : current,
                            )
                          }
                          rows={5}
                          placeholder={"/login\n/board/history"}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                        <p className="text-xs text-slate-500">
                          한 줄에 하나씩 입력하면 저장 후 재색인 대상에서 제외됩니다.
                        </p>
                      </label>
                    </>
                  ) : null}
                </div>

                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
                  <div>
                    <strong className="mr-2 text-slate-900">소스 유형</strong>
                    {sourceTypeLabel(detail.sourceType)}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">상태</strong>
                    {statusLabel(detail.status)}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">색인 Job 상태</strong>
                    {detail.ingestionStatus ?? "-"}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">상태 복구</strong>
                    {detail.recoveryAction ?? "-"}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">재색인 필요</strong>
                    {detail.reindexRequired ? "필요" : "없음"}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">생성일</strong>
                    {new Date(detail.createdAt).toLocaleString("ko-KR")}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">마지막 색인</strong>
                    {detail.lastIndexedAt ? new Date(detail.lastIndexedAt).toLocaleString("ko-KR") : "-"}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">텍스트 길이</strong>
                    {formatCount(detail.extractedTextLength)}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">청크 / 임베딩</strong>
                    {formatCount(detail.chunkCount)} / {formatCount(detail.embeddingCount)}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">파일 또는 URL</strong>
                    {detail.fileName ?? detail.sourceUrl ?? detail.finalUrl ?? detail.url ?? "-"}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">PDF 추출 방식</strong>
                    {extractionMethodLabel(detail.extractionMethod)}
                  </div>
                  <div>
                    <strong className="mr-2 text-slate-900">민감 정보</strong>
                    {detail.sensitiveDetected ? "감지됨" : "없음"}
                  </div>
                  {detail.sourceType === "website" ? (
                    <>
                      <div>
                        <strong className="mr-2 text-slate-900">크롤링 페이지 수</strong>
                        {detail.crawledPageCount ?? 0} / {detail.crawlPageLimit ?? "-"}
                      </div>
                      <div>
                        <strong className="mr-2 text-slate-900">하위 페이지 전체 수집</strong>
                        {detail.crawlAllPages ?? true ? "사용" : "미사용"}
                      </div>
                      <div>
                        <strong className="mr-2 text-slate-900">첨부파일 색인</strong>
                        {detail.includeAttachments ?? true ? "사용" : "미사용"}
                      </div>
                      <div>
                        <strong className="mr-2 text-slate-900">첨부 파일 수</strong>
                        {detail.attachmentFileCount ?? detail.attachmentFiles?.length ?? 0}
                      </div>
                      <div>
                        <strong className="mr-2 text-slate-900">제외 경로</strong>
                        {detail.excludedPaths && detail.excludedPaths.length > 0 ? detail.excludedPaths.join(", ") : "-"}
                      </div>
                    </>
                  ) : null}
                  <div className="md:col-span-2">
                    <strong className="mr-2 text-slate-900">색인 오류</strong>
                    {detail.errorMessage ?? "-"}
                  </div>
                </div>

                {detail.sourceType === "website" ? (
                  <div className="rounded-2xl border border-slate-200">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h4 className="text-sm font-semibold text-slate-900">수집된 첨부파일 목록</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        웹사이트 내부 링크에서 수집한 문서 파일과 텍스트 추출 결과입니다.
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto px-4 py-3">
                      {detail.attachmentFiles && detail.attachmentFiles.length > 0 ? (
                        <ul className="space-y-2">
                          {detail.attachmentFiles.map((file, index) => (
                            <li
                              key={`${file.url ?? file.fileName ?? "attachment"}-${index}`}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-900">{file.fileName ?? "첨부파일"}</span>
                                {file.fileType ? <span className="rounded-full bg-slate-200 px-2 py-0.5">{file.fileType}</span> : null}
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    file.extracted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {file.extracted ? "추출 완료" : file.extractionStatus === "failed" ? "추출 실패" : "추출 없음"}
                                </span>
                                {typeof file.textLength === "number" ? (
                                  <span className="text-slate-500">텍스트 {file.textLength.toLocaleString()}자</span>
                                ) : null}
                              </div>
                              {file.url ? (
                                <a href={file.url} target="_blank" rel="noreferrer" className="mt-2 block break-all hover:text-blue-700 hover:underline">
                                  {file.url}
                                </a>
                              ) : null}
                              {file.errorMessage ? <div className="mt-2 text-rose-600">{file.errorMessage}</div> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          아직 수집된 첨부파일 정보가 없습니다.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {detail.sourceType === "website" ? (
                  <div className="rounded-2xl border border-slate-200">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h4 className="text-sm font-semibold text-slate-900">수집된 URL 목록</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        현재 색인에 포함된 웹페이지입니다. 제외 경로를 수정한 뒤 재색인을 실행하면 목록이 갱신됩니다.
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto px-4 py-3">
                      {detail.crawledUrls && detail.crawledUrls.length > 0 ? (
                        <ul className="space-y-2">
                          {detail.crawledUrls.map((url) => (
                            <li key={url} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              <a href={url} target="_blank" rel="noreferrer" className="break-all hover:text-blue-700 hover:underline">
                                {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          아직 수집된 URL 정보가 없습니다.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editor.isActive}
                    onChange={(event) =>
                      setEditor((current) => (current ? { ...current, isActive: event.target.checked } : current))
                    }
                  />
                  활성
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveDetail()}
                    disabled={isSaving}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    저장
                  </button>
                  {detail.sourceType === "website" ? (
                    <button
                      type="button"
                      onClick={() => void saveDetail({ reindexAfterSave: true })}
                      disabled={isSaving}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      저장 후 재색인
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void performRowAction(detail.id, "reindex")}
                    disabled={isSaving}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
                  >
                    재색인
                  </button>
                  <button
                    type="button"
                    onClick={() => void performRowAction(detail.id, "toggle", detail.isActive)}
                    disabled={isSaving}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
                  >
                    {detail.isActive ? "비활성화" : "활성화"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void performRowAction(detail.id, "delete")}
                    disabled={isSaving}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
