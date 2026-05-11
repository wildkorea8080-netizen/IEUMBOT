"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Search, RefreshCw, Trash2, Wand2,
  CheckCircle, Loader2, XCircle, Clock, BookOpen,
} from "lucide-react";

import { FaqGenerateModal } from "./FaqGenerateModal";
import { ApiClientError } from "../../lib/api";
import {
  deleteKnowledge,
  getAdminChatbots,
  getKnowledgeDetail,
  getKnowledgeList,
  getKnowledgeRuntimeStatus,
  patchAdminChatbot,
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
  const [faqTargetItem, setFaqTargetItem] = useState<KnowledgeItem | null>(null);
  const [settingsChatbotId, setSettingsChatbotId] = useState<string | null>(null);
  const [skipDuplicateReindex, setSkipDuplicateReindex] = useState(false);
  // 다른 탭의 건수 (탭 뱃지에 항상 양쪽 표시)
  const [otherGroupCount, setOtherGroupCount] = useState<number>(0);

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
    const otherGroup = sourceGroup === "file_text" ? "website" : "file_text";
    try {
      const [response, otherRes, runtime, chatbotResponse] = await Promise.all([
        getKnowledgeList({
          sourceGroup,
          q: query.trim() || undefined,
          category: category || undefined,
          field: field || undefined,
          status: status || undefined,
        }),
        getKnowledgeList({ sourceGroup: otherGroup }),
        getKnowledgeRuntimeStatus(),
        getAdminChatbots(),
      ]);
      setItems(response.items);
      setOtherGroupCount(otherRes.items.length);
      setRuntimeStatus(runtime);
      const chatbot = chatbotResponse.items[0];
      setSettingsChatbotId(chatbot?.id ?? null);
      setSkipDuplicateReindex(chatbot?.skipDuplicateFileReindex ?? false);
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

  const handleSkipDuplicateToggle = async (value: boolean) => {
    if (!settingsChatbotId) return;
    const previous = skipDuplicateReindex;
    setSkipDuplicateReindex(value);
    setError(null);
    try {
      await patchAdminChatbot(settingsChatbotId, {
        skipDuplicateFileReindex: value,
      });
    } catch (toggleError) {
      setSkipDuplicateReindex(previous);
      setError(getErrorMessage(toggleError));
    }
  };

  // 탭별 카운트: 현재 탭은 items.length, 반대 탭은 otherGroupCount
  const fileCount = sourceGroup === "file_text" ? items.length : otherGroupCount;
  const websiteCount = sourceGroup === "website" ? items.length : otherGroupCount;

  // 상태 아이콘
  const StatusBadge = ({ item }: { item: KnowledgeItem }) => {
    const ds = effectiveStatus(item);
    if (ds === "completed" || ds === "ready") return <span className="badge-success flex items-center gap-1"><CheckCircle style={{ width: 11, height: 11 }} />학습완료</span>;
    if (ds === "processing") return <span className="badge-warning flex items-center gap-1"><Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />학습중</span>;
    if (ds === "failed") return <span className="badge-danger flex items-center gap-1"><XCircle style={{ width: 11, height: 11 }} />실패</span>;
    if (ds === "queued") return <span className="badge-neutral flex items-center gap-1"><Clock style={{ width: 11, height: 11 }} />대기중</span>;
    if (ds === "needs_reindex") return <span className="badge-warning flex items-center gap-1">재학습필요</span>;
    return <span className="badge-neutral">{statusLabel(ds)}</span>;
  };

  return (
    <div className="space-y-4">

      {/* 탭 + 우측 액션 */}
      <div className="flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div className="flex">
          {([["file_text", `파일·텍스트 (${fileCount})`], ["website", `웹사이트 (${websiteCount})`]] as [KnowledgeSourceGroup, string][]).map(([group, label]) => (
            <button
              key={group}
              type="button"
              onClick={() => setSourceGroup(group)}
              style={{
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: sourceGroup === group ? 600 : 400,
                color: sourceGroup === group ? "#2563eb" : "#64748b",
                borderBottom: `2px solid ${sourceGroup === group ? "#2563eb" : "transparent"}`,
                background: "none",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: sourceGroup === group ? "#2563eb" : "transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <Link href="/admin/knowledge/register" className="btn-primary" style={{ fontSize: 13, padding: "7px 14px" }}>
          + 지식 등록
        </Link>
      </div>

      {/* 중복 방지 설정 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={skipDuplicateReindex} disabled={!settingsChatbotId} onChange={e => void handleSkipDuplicateToggle(e.target.checked)} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>중복 파일 재학습 방지</span>
        </label>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>동일한 파일명을 다시 업로드해도 재학습하지 않습니다</span>
      </div>

      {/* 검색 + 필터 바 */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-wrap items-center gap-3">
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#94a3b8" }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="제목, 내용, 메모 또는 태그 검색" className="input-field" style={{ paddingLeft: 32 }} />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input-field" style={{ width: 140 }}>
          <option value="">전체 카테고리</option>
          {categories.map(opt => <option key={opt} value={opt ?? ""}>{opt}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="input-field" style={{ width: 120 }}>
          <option value="">전체 상태</option>
          <option value="queued">대기중</option>
          <option value="processing">처리중</option>
          <option value="completed">완료</option>
          <option value="failed">실패</option>
          <option value="inactive">비활성</option>
        </select>
        <button type="button" onClick={() => void load()} className="btn-secondary flex items-center gap-1.5" style={{ fontSize: 13 }}>
          <Search style={{ width: 13, height: 13 }} />검색
        </button>
      </div>

      {/* 알림 */}
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {notice && <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#1d4ed8" }}>{notice}</div>}

      {/* 벌크 액션 */}
      {selectedIds.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>{selectedIds.length}건 선택됨</span>
          <button type="button" disabled={isSaving} onClick={() => void runBulkAction("inactive")} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>비활성화</button>
          <button type="button" disabled={isSaving} onClick={() => void runBulkAction("delete")} style={{ fontSize: 12, padding: "5px 12px", background: "white", border: "1px solid #fca5a5", borderRadius: 8, color: "#dc2626", cursor: "pointer" }}>삭제</button>
        </div>
      )}

      {/* 테이블 */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
          <Loader2 style={{ width: 24, height: 24, margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
          목록을 불러오는 중입니다.
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <BookOpen style={{ width: 48, height: 48, color: "#cbd5e1", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#334155", marginBottom: 6 }}>등록된 지식이 없습니다</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>지식 등록 버튼을 클릭해 문서를 추가해보세요</div>
          <Link href="/admin/knowledge/register" className="btn-primary" style={{ fontSize: 13 }}>지식 등록하기</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
          <table style={{ width: "100%", minWidth: 1100, fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="table-header" style={{ width: 40 }}>
                  <input type="checkbox" checked={items.length > 0 && selectedIds.length === items.length} onChange={toggleAll} />
                </th>
                <th className="table-header" style={{ width: 80 }}>구분</th>
                <th className="table-header" style={{ width: 100 }}>카테고리</th>
                <th className="table-header">제목</th>
                <th className="table-header" style={{ width: 120 }}>태그</th>
                <th className="table-header" style={{ width: 110 }}>상태</th>
                <th className="table-header" style={{ width: 130 }}>처리 시각</th>
                <th className="table-header" style={{ width: 120 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    조건에 맞는 지식이 없습니다.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                    className="hover:bg-neutral-50 transition-colors"
                  >
                    {/* 체크박스 */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds(c => c.includes(item.id) ? c.filter(id => id !== item.id) : [...c, item.id])} />
                    </td>
                    {/* 구분 */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <span className="badge-neutral" style={{ fontSize: 11 }}>{sourceTypeLabel(item.sourceType)}</span>
                    </td>
                    {/* 카테고리 */}
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#64748b", verticalAlign: "middle" }}>
                      {item.category ?? "-"}
                    </td>
                    {/* 제목 */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <div style={{ fontWeight: 500, color: "#1e293b", fontSize: 13 }}>
                        {item.title}
                        {item.sensitiveDetected && <span style={{ marginLeft: 6, fontSize: 11, color: "#d97706" }}>🔒 민감정보</span>}
                      </div>
                      {item.summary && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>
                          {item.summary}
                        </div>
                      )}
                      {getDiagnosticWarnings(item).length > 0 && (
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {getDiagnosticWarnings(item).slice(0, 2).map(w => (
                            <span key={w} style={{ fontSize: 10, background: "#fffbeb", color: "#d97706", padding: "1px 6px", borderRadius: 4 }}>{w}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    {/* 태그 */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {item.tags.slice(0, 3).map(t => <span key={t} className="badge-neutral" style={{ fontSize: 10 }}>{t}</span>)}
                        {item.tags.length > 3 && <span className="badge-neutral" style={{ fontSize: 10 }}>+{item.tags.length - 3}</span>}
                        {item.tags.length === 0 && <span style={{ fontSize: 12, color: "#cbd5e1" }}>-</span>}
                      </div>
                    </td>
                    {/* 상태 */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <StatusBadge item={item} />
                        {item.canSearch && <span className="badge-success" style={{ fontSize: 10 }}>검색가능</span>}
                      </div>
                    </td>
                    {/* 처리 시각 */}
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8", verticalAlign: "middle" }}>
                      {formatDateTime(item.lastProcessedAt ?? item.indexedAt)}
                    </td>
                    {/* 액션 아이콘 버튼 */}
                    <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button type="button" onClick={() => void openDetail(item.id)} title="상세" className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }}>상세</button>
                        <button type="button" onClick={() => void performRowAction(item.id, "reindex")} title="재색인" style={{ padding: 6, background: "none", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", color: "#64748b", display: "flex" }}>
                          <RefreshCw style={{ width: 13, height: 13 }} />
                        </button>
                        {item.sourceType !== "website" && (
                          <button type="button" onClick={() => setFaqTargetItem(item)} title="FAQ 생성" style={{ padding: 6, background: "none", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", color: "#2563eb", display: "flex" }}>
                            <Wand2 style={{ width: 13, height: 13 }} />
                          </button>
                        )}
                        <button type="button" onClick={() => void performRowAction(item.id, "delete")} title="삭제" style={{ padding: 6, background: "none", border: "1px solid #fca5a5", borderRadius: 6, cursor: "pointer", color: "#dc2626", display: "flex" }}>
                          <Trash2 style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

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

      {faqTargetItem ? (
        <FaqGenerateModal
          knowledgeId={faqTargetItem.id}
          knowledgeTitle={faqTargetItem.title}
          onClose={() => setFaqTargetItem(null)}
          onRegistered={(count) => {
            setFaqTargetItem(null);
            setNotice(`${count}개 FAQ가 등록되었습니다.`);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
