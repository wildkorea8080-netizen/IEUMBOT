"use client";

import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Search, RefreshCw, Trash2, ChevronDown, ChevronRight as ChevronRightIcon,
  CheckCircle, Loader2, XCircle, Clock, BookOpen, PenLine, Globe,
  Upload, Shield,
} from "lucide-react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Link as TiptapLink } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";

import { FaqAnalyzeModal } from "./FaqAnalyzeModal";
import { FaqGenerateModal } from "./FaqGenerateModal";
import { FaqManagement } from "./faq-management";
import { ApiClientError } from "../../lib/api";
import {
  deleteKnowledge,
  getAdminChatbots,
  getKnowledgeContent,
  getKnowledgeDetail,
  getKnowledgeList,
  getKnowledgeRuntimeStatus,
  getWebSourceSyncSettings,
  listFaqItems,
  patchAdminChatbot,
  patchKnowledge,
  reindexAllKnowledge,
  reindexKnowledge,
  triggerWebSourceSync,
  updateKnowledgeContent,
  updateWebSourceSyncSettings,
} from "../../lib/api/admin-operations";
import type {
  KnowledgeDetail,
  KnowledgeItem,
  KnowledgeRuntimeStatus,
  KnowledgeSourceGroup,
  WebSourceSyncSettings,
} from "../../lib/api/admin-operations-types";

// ── 에디터 툴바 ────────────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, label: string, title?: string) => (
    <button
      key={label}
      type="button"
      title={title ?? label}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={{
        padding: "3px 7px", fontSize: 12, fontWeight: active ? 700 : 400,
        border: `1px solid ${active ? "#2563eb" : "#e5e7eb"}`,
        borderRadius: 4, background: active ? "#eff6ff" : "#fff",
        color: active ? "#2563eb" : "#374151", cursor: "pointer", minWidth: 26, lineHeight: 1.4,
      }}
    >{label}</button>
  );

  const sep = () => <div style={{ width: 1, background: "#e5e7eb", margin: "0 2px", alignSelf: "stretch" }} />;

  const insertTable = () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  const insertImage = () => {
    const url = prompt("이미지 URL을 입력하세요:");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };
  const setLink = () => {
    const url = prompt("링크 URL을 입력하세요:", editor.getAttributes("link").href ?? "");
    if (url === null) return;
    if (url === "") { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "6px 10px", borderBottom: "1px solid #f1f5f9", background: "#f9fafb" }}>
      {btn(editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), "H1")}
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2")}
      {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3")}
      {btn(editor.isActive("paragraph"), () => editor.chain().focus().setParagraph().run(), "P", "본문")}
      {sep()}
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "B", "굵게")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "I", "기울임")}
      {btn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "U", "밑줄")}
      {btn(editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "S", "취소선")}
      {sep()}
      <button type="button" title="수평선" onMouseDown={e => { e.preventDefault(); editor.chain().focus().setHorizontalRule().run(); }}
        style={{ padding: "3px 7px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff", color: "#374151", cursor: "pointer" }}>—</button>
      {btn(editor.isActive("code"), () => editor.chain().focus().toggleCode().run(), "<>", "코드")}
      {sep()}
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "• List", "글머리 목록")}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "1. List", "번호 목록")}
      {btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "→", "인용")}
      {sep()}
      <button type="button" title="표 삽입" onMouseDown={e => { e.preventDefault(); insertTable(); }}
        style={{ padding: "3px 7px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff", color: "#374151", cursor: "pointer" }}>Table</button>
      <button type="button" title="링크" onMouseDown={e => { e.preventDefault(); setLink(); }}
        style={{ padding: "3px 7px", fontSize: 12, border: `1px solid ${editor.isActive("link") ? "#2563eb" : "#e5e7eb"}`, borderRadius: 4, background: editor.isActive("link") ? "#eff6ff" : "#fff", color: editor.isActive("link") ? "#2563eb" : "#374151", cursor: "pointer" }}>Link</button>
      <button type="button" title="이미지 삽입" onMouseDown={e => { e.preventDefault(); insertImage(); }}
        style={{ padding: "3px 7px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff", color: "#374151", cursor: "pointer" }}>Image</button>
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState<"file_text" | "website" | "faq">("file_text");
  const sourceGroup: KnowledgeSourceGroup = activeTab === "faq" ? "file_text" : activeTab;
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [field, setField] = useState("");
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 내용 에디터
  const [contentText, setContentText] = useState("");
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [isContentSaving, setIsContentSaving] = useState(false);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const [showContentEditor, setShowContentEditor] = useState(false);
  // 웹사이트 탭 도메인 펼침
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  // 웹사이트 자동 업데이트 모달
  const [syncModalId, setSyncModalId] = useState<string | null>(null);
  const [syncSettings, setSyncSettings] = useState<WebSourceSyncSettings | null>(null);
  const [isSyncLoading, setIsSyncLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<KnowledgeRuntimeStatus | null>(null);
  const [faqTargetItem, setFaqTargetItem] = useState<KnowledgeItem | null>(null);
  const [faqAnalyzeItem, setFaqAnalyzeItem] = useState<KnowledgeItem | null>(null);
  const [settingsChatbotId, setSettingsChatbotId] = useState<string | null>(null);
  const [skipDuplicateReindex, setSkipDuplicateReindex] = useState(false);
  // 탭별 안정적인 카운트 (로딩 중에도 정확한 수 유지)
  const [stableFileCnt, setStableFileCnt] = useState<number>(0);
  const [stableWebCnt, setStableWebCnt] = useState<number>(0);
  const [faqCount, setFaqCount] = useState<number>(0);
  // 관련 파일 탭
  const [relatedFileTab, setRelatedFileTab] = useState<"file" | "youtube">("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  // 전체 재색인
  const [isReindexingAll, setIsReindexingAll] = useState(false);

  // TipTap 에디터 인스턴스 (내용 편집용)
  const contentEditor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TiptapLink.configure({ openOnClick: false }),
      Image,
      Table,
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    onUpdate: () => setIsContentDirty(true),
    editorProps: {
      attributes: { style: "min-height:200px;padding:12px;outline:none;font-size:13px;line-height:1.8;" },
    },
  });

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(),
    [items],
  );

  const fields = useMemo(
    () => Array.from(new Set(items.map((item) => item.field).filter(Boolean))).sort(),
    [items],
  );

  // 웹사이트 탭: 도메인별 그룹
  const byDomain = useMemo(() => {
    const map = new Map<string, KnowledgeItem[]>();
    for (const item of items) {
      let domain = "기타";
      try { domain = new URL(item.sourceUrl ?? item.sourceLabel ?? "http://x").hostname || "기타"; } catch { /* */ }
      if (!map.has(domain)) map.set(domain, []);
      map.get(domain)!.push(item);
    }
    return map;
  }, [items]);

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
      if (sourceGroup === "file_text") {
        setStableFileCnt(response.items.length);
        setStableWebCnt(otherRes.items.length);
      } else {
        setStableWebCnt(response.items.length);
        setStableFileCnt(otherRes.items.length);
      }
      setRuntimeStatus(runtime);
      const chatbot = chatbotResponse.items[0];
      setSettingsChatbotId(chatbot?.id ?? null);
      setSkipDuplicateReindex(chatbot?.skipDuplicateFileReindex ?? false);
      if (chatbot?.id) {
        void listFaqItems(chatbot.id, true)
          .then(res => setFaqCount(res.total))
          .catch(() => {});
      }
      setSelectedIds((current) => current.filter((id) => response.items.some((item) => item.id === id)));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "faq") void load();
  }, [activeTab]);

  const openDetail = async (knowledgeId: string) => {
    setIsDetailLoading(true);
    setError(null);
    setShowContentEditor(false);
    setIsContentDirty(false);
    setContentText("");
    try {
      const response = await getKnowledgeDetail(knowledgeId);
      setDetail(response);
      setEditor(toEditor(response));
      // 파일/텍스트 타입이면 내용 자동 로드
      if (response.sourceGroup === "file_text") {
        setIsContentLoading(true);
        try {
          const c = await getKnowledgeContent(knowledgeId);
          setContentText(c.content ?? "");
          if (contentEditor) {
            contentEditor.commands.setContent(
              c.content ? `<p>${c.content.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>` : "<p></p>",
            );
          }
        } catch { /* 내용 로드 실패는 무시 */ }
        finally { setIsContentLoading(false); }
      }
    } catch (detailError) {
      setError(getErrorMessage(detailError));
    } finally {
      setIsDetailLoading(false);
    }
  };

  const saveContent = async () => {
    if (!detail || !contentEditor) return;
    setIsContentSaving(true);
    try {
      const html = contentEditor.getHTML();
      // HTML → 텍스트 변환 (태그 제거)
      const text = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "").trim();
      await updateKnowledgeContent(detail.id, text);
      setIsContentDirty(false);
      setNotice("내용이 저장되었습니다. 재색인이 시작됩니다.");
      setTimeout(() => setNotice(null), 3000);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsContentSaving(false);
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

  const handleReindexAll = async () => {
    if (!settingsChatbotId) return;
    if (!confirm("모든 지식 항목을 재색인하시겠습니까?\n\nContextual Retrieval 문맥 생성이 포함되어 처리 시간이 걸릴 수 있습니다.")) return;
    setIsReindexingAll(true);
    setError(null);
    try {
      const result = await reindexAllKnowledge(settingsChatbotId);
      setNotice(`재색인 큐에 ${result.queued}개 등록됨 (건너뜀: ${result.skipped}개). 목록을 새로고침하면 진행 상태를 확인할 수 있습니다.`);
      void load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsReindexingAll(false);
    }
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

  // 탭별 카운트: 로딩 중·이후 모두 안정적인 캐시 값 사용
  const fileCount = stableFileCnt;
  const websiteCount = stableWebCnt;

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
          {([
            ["file_text", `파일·텍스트 (${fileCount})`],
            ["website", `웹사이트 (${websiteCount})`],
            ["faq", faqCount > 0 ? `FAQ (${faqCount})` : "FAQ"],
          ] as ["file_text" | "website" | "faq", string][]).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "#2563eb" : "#64748b",
                background: "none",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: activeTab === tab ? "#2563eb" : "transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {activeTab !== "faq" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => void handleReindexAll()}
              disabled={isReindexingAll || !settingsChatbotId}
              title="모든 지식 항목 재색인 (Contextual Retrieval 적용)"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 13, padding: "7px 14px", borderRadius: 8,
                border: "1px solid #e2e8f0", background: "#f8fafc",
                color: "#475569", cursor: isReindexingAll || !settingsChatbotId ? "not-allowed" : "pointer",
                opacity: isReindexingAll || !settingsChatbotId ? 0.6 : 1,
              }}
            >
              <RefreshCw style={{ width: 14, height: 14, ...(isReindexingAll ? { animation: "spin 1s linear infinite" } : {}) }} />
              {isReindexingAll ? "재색인 중..." : "전체 재색인"}
            </button>
            <NextLink href="/admin/knowledge/register" className="btn-primary" style={{ fontSize: 13, padding: "7px 14px" }}>
              + 지식 등록
            </NextLink>
          </div>
        )}
      </div>

      {activeTab === "faq" ? <FaqManagement onCountLoaded={setFaqCount} /> : (
      <>

      {/* 중복 방지 설정 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={skipDuplicateReindex} disabled={!settingsChatbotId} onChange={e => void handleSkipDuplicateToggle(e.target.checked)} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>중복 파일 재학습 방지</span>
        </label>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>동일한 파일명을 다시 업로드해도 재학습하지 않습니다</span>
      </div>

      {/* 검색 바 + 구분 필터 */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#9ca3af", pointerEvents: "none" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void load(); }}
            placeholder="제목, 내용, 메모, 태그로 검색하세요."
            className="input-field"
            style={{ paddingLeft: 40, width: "100%", background: "#fff", borderRadius: 10 }}
          />
        </div>
        {categories.length > 0 && (
          <select value={category} onChange={e => { setCategory(e.target.value); void load(); }}
            className="input-field" style={{ width: 160, borderRadius: 10 }}>
            <option value="">전체 구분</option>
            {categories.map(c => <option key={c ?? ""} value={c ?? ""}>{c}</option>)}
          </select>
        )}
        {fields.length > 0 && (
          <select value={field} onChange={e => { setField(e.target.value); void load(); }}
            className="input-field" style={{ width: 160, borderRadius: 10 }}>
            <option value="">전체 분야</option>
            {fields.map(f => <option key={f ?? ""} value={f ?? ""}>{f}</option>)}
          </select>
        )}
      </div>

      {/* 알림 */}
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {notice && <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#1d4ed8" }}>{notice}</div>}

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
          <NextLink href="/admin/knowledge/register" className="btn-primary" style={{ fontSize: 13 }}>지식 등록하기</NextLink>
        </div>
      ) : sourceGroup === "website" ? (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {[...byDomain.entries()].map(([domain, domainItems]) => {
            const isExpanded = expandedDomains.has(domain);
            const firstItem = domainItems[0];
            return (
              <div key={domain} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "#fafafa" }}>
                  <div onClick={() => setExpandedDomains(prev => { const n = new Set(prev); if (n.has(domain)) n.delete(domain); else n.add(domain); return n; })}
                    style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer" }}>
                    {isExpanded ? <ChevronDown style={{ width: 14, height: 14, color: "#6b7280" }} /> : <ChevronRightIcon style={{ width: 14, height: 14, color: "#6b7280" }} />}
                    <Globe style={{ width: 14, height: 14, color: "#2563eb" }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{domain}</span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>({domainItems.length}개)</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button"
                      disabled={syncingId === firstItem.id}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setSyncingId(firstItem.id);
                        try {
                          await triggerWebSourceSync(firstItem.id);
                          setNotice("업데이트 작업이 시작되었습니다.");
                          void load();
                        } catch { setError("업데이트 요청에 실패했습니다."); }
                        finally { setSyncingId(null); }
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 12, border: "1px solid #2563eb", borderRadius: 6, background: "#eff6ff", color: "#2563eb", cursor: "pointer" }}>
                      {syncingId === firstItem.id ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <RefreshCw style={{ width: 11, height: 11 }} />}
                      지금 업데이트
                    </button>
                    <button type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setIsSyncLoading(true);
                        setSyncModalId(firstItem.id);
                        try {
                          const s = await getWebSourceSyncSettings(firstItem.id);
                          setSyncSettings(s);
                        } catch { setSyncSettings(null); }
                        finally { setIsSyncLoading(false); }
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", color: "#374151", cursor: "pointer" }}>
                      자동 업데이트 설정
                    </button>
                  </div>
                </div>
                {isExpanded && domainItems.map(item => (
                  <div key={item.id} onClick={() => void openDetail(item.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px 10px 44px", borderTop: "1px solid #f9fafb", cursor: "pointer" }}
                    className="hover:bg-neutral-50">
                    <input type="checkbox" checked={selectedIds.includes(item.id)} onClick={e => e.stopPropagation()}
                      onChange={() => setSelectedIds(c => c.includes(item.id) ? c.filter(id => id !== item.id) : [...c, item.id])}
                      style={{ width: 14, height: 14 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sourceUrl ?? item.sourceLabel}</div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {item.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 10, border: "1px solid #e5e7eb", borderRadius: 20, padding: "1px 8px", color: "#374151" }}>{t}</span>)}
                    </div>
                    <StatusBadge item={item} />
                    <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button type="button" onClick={() => void performRowAction(item.id, "reindex")} style={{ padding: 4, background: "none", border: "1px solid #e2e8f0", borderRadius: 5, cursor: "pointer", color: "#64748b" }}>
                        <RefreshCw style={{ width: 12, height: 12 }} />
                      </button>
                      <button type="button" onClick={() => void performRowAction(item.id, "delete")} style={{ padding: 4, background: "none", border: "1px solid #fca5a5", borderRadius: 5, cursor: "pointer", color: "#dc2626" }}>
                        <Trash2 style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
          {/* 목록 헤더 */}
          <div style={{ display: "flex", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid #f1f5f9" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#374151" }}>
              <input type="checkbox" checked={items.length > 0 && selectedIds.length === items.length} onChange={toggleAll}
                style={{ width: 15, height: 15 }} />
              <span style={{ fontWeight: 600 }}>등록된 지식 ({items.length})</span>
            </label>
            {selectedIds.length > 0 && (
              <div style={{ marginLeft: 16, display: "flex", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{selectedIds.length}개 선택</span>
                <button type="button" disabled={isSaving} onClick={() => void runBulkAction("inactive")} style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151" }}>비활성화</button>
                <button type="button" disabled={isSaving} onClick={() => void runBulkAction("delete")} style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#dc2626" }}>삭제</button>
              </div>
            )}
          </div>

          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ width: 36, padding: "10px 16px", textAlign: "center" }} />
                <th style={{ width: 160, padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>구분</th>
                <th style={{ width: 160, padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>분야</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>제목</th>
                <th style={{ width: 220, padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>태그</th>
                <th style={{ width: 90, padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>생성일</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => void openDetail(item.id)}
                  style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  className="hover:bg-neutral-50 transition-colors"
                >
                  {/* 체크박스 */}
                  <td style={{ padding: "14px 16px", verticalAlign: "top", paddingTop: 16 }}
                    onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.includes(item.id)}
                      onChange={() => setSelectedIds(c => c.includes(item.id) ? c.filter(id => id !== item.id) : [...c, item.id])}
                      style={{ width: 14, height: 14 }} />
                  </td>

                  {/* 구분 */}
                  <td style={{ padding: "14px 16px", verticalAlign: "top", color: "#6b7280", fontSize: 13 }}>
                    <div style={{ lineHeight: 1.5 }}>{item.category ?? item.title.slice(0, 20)}</div>
                    <div style={{ marginTop: 4 }}>
                      <StatusBadge item={item} />
                    </div>
                  </td>

                  {/* 분야 */}
                  <td style={{ padding: "14px 16px", verticalAlign: "top", color: "#6b7280", fontSize: 13 }}>
                    {item.field
                      ? item.field.includes(">")
                        ? item.field
                        : item.field
                      : <span style={{ color: "#d1d5db" }}>-</span>
                    }
                  </td>

                  {/* 제목 + 미리보기 */}
                  <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 600, color: "#111827", fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      {item.title}
                    </div>
                    {item.summary && (
                      <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {item.summary}
                      </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {item.sensitiveDetected && (
                        <span style={{ fontSize: 11, color: "#6b7280", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          🔒 민감정보 {/* count */}
                        </span>
                      )}
                      {getDiagnosticWarnings(item).slice(0, 1).map(w => (
                        <span key={w} style={{ fontSize: 10, background: "#fffbeb", color: "#d97706", padding: "1px 6px", borderRadius: 4 }}>{w}</span>
                      ))}
                    </div>
                  </td>

                  {/* 태그 */}
                  <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {item.tags.slice(0, 5).map(t => (
                        <span key={t} style={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 20, padding: "2px 10px", color: "#374151", background: "#fff", whiteSpace: "nowrap" }}>{t}</span>
                      ))}
                      {item.tags.length > 5 && (
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>+{item.tags.length - 5}</span>
                      )}
                    </div>
                  </td>

                  {/* 생성일 */}
                  <td style={{ padding: "14px 16px", verticalAlign: "top", fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }).replace(/\. /g, "-").replace(".", "") : "-"}
                  </td>
                </tr>
              ))}
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

            {isDetailLoading ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                <Loader2 style={{ width: 20, height: 20, margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
                불러오는 중...
              </div>
            ) : null}

            {/* PII 감지 결과 */}
            {detail && detail.sensitiveDetected && (
              <div style={{ margin: "12px 24px 0", padding: "10px 14px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
                <Shield style={{ width: 14, height: 14, color: "#ea580c", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#ea580c", marginBottom: 2 }}>민감정보 감지됨</div>
                  <div style={{ fontSize: 11, color: "#9a3412", lineHeight: 1.5 }}>이 문서에서 개인정보·민감정보가 감지되었습니다. 내용 검토 후 필요 시 수정하세요.</div>
                </div>
              </div>
            )}

            {/* ── 내용 에디터 섹션 ── */}
            {detail && detail.sourceGroup === "file_text" && (
              <div style={{ borderBottom: "1px solid #e5e7eb", margin: "0 24px", paddingBottom: 16, paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>지식 내용</span>
                    {isContentLoading && <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite", color: "#9ca3af" }} />}
                    {detail.chunkCount !== undefined && (
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{detail.chunkCount ?? 0}개 청크</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button"
                      onClick={() => setShowContentEditor(p => !p)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", border: `1px solid ${showContentEditor ? "#2563eb" : "#e5e7eb"}`, borderRadius: 6, background: showContentEditor ? "#eff6ff" : "#f9fafb", color: showContentEditor ? "#2563eb" : "#6b7280", fontSize: 12, cursor: "pointer" }}>
                      <PenLine style={{ width: 11, height: 11 }} />{showContentEditor ? "닫기" : "수정"}
                    </button>
                    {showContentEditor && isContentDirty && (
                      <button type="button" onClick={() => void saveContent()} disabled={isContentSaving}
                        style={{ padding: "4px 12px", border: "none", borderRadius: 6, background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: isContentSaving ? 0.6 : 1 }}>
                        {isContentSaving ? "저장 중..." : "저장 후 재색인"}
                      </button>
                    )}
                  </div>
                </div>

                {isContentLoading ? (
                  <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>내용 로딩 중...</div>
                ) : showContentEditor ? (
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa" }}>
                    <EditorToolbar editor={contentEditor} />
                    <EditorContent editor={contentEditor} />
                  </div>
                ) : contentText ? (
                  <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.8, maxHeight: 200, overflowY: "auto", background: "#fafafa", borderRadius: 8, padding: "10px 12px", border: "1px solid #f1f5f9", whiteSpace: "pre-wrap" }}>
                    {contentText.slice(0, 600)}{contentText.length > 600 ? "..." : ""}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "12px 0" }}>
                    내용을 불러오지 못했습니다. 수정 버튼을 눌러 직접 입력할 수 있습니다.
                  </div>
                )}
              </div>
            )}

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
                  {/* 관련 파일 */}
                  <div className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">관련 파일</span>
                    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 8 }}>
                      {(["file", "youtube"] as const).map(tab => (
                        <button key={tab} type="button"
                          onClick={() => setRelatedFileTab(tab)}
                          style={{ padding: "6px 14px", fontSize: 12, fontWeight: relatedFileTab === tab ? 600 : 400, color: relatedFileTab === tab ? "#2563eb" : "#6b7280", background: "none", border: "none", borderBottom: `2px solid ${relatedFileTab === tab ? "#2563eb" : "transparent"}`, cursor: "pointer", marginBottom: -1 }}>
                          {tab === "file" ? "파일 업로드" : "YouTube 링크"}
                        </button>
                      ))}
                    </div>
                    {relatedFileTab === "file" ? (
                      <div style={{ border: "2px dashed #e5e7eb", borderRadius: 8, padding: "20px 16px", textAlign: "center", background: "#fafafa" }}>
                        <Upload style={{ width: 20, height: 20, color: "#9ca3af", margin: "0 auto 6px" }} />
                        <div style={{ fontSize: 12, color: "#6b7280" }}>파일을 드래그하거나 클릭하여 업로드</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>PDF, DOCX, XLSX (최대 10MB)</div>
                      </div>
                    ) : (
                      <input
                        value={youtubeUrl}
                        onChange={e => setYoutubeUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}
                  </div>

                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">버전 메모</span>
                    <textarea
                      value={editor.memo}
                      onChange={(event) =>
                        setEditor((current) => (current ? { ...current, memo: event.target.value } : current))
                      }
                      rows={3}
                      placeholder="이 버전에 대한 변경 내용 또는 메모를 입력하세요."
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
                    onClick={() => setFaqAnalyzeItem(detail)}
                    disabled={isSaving || !settingsChatbotId}
                    className="rounded-lg border border-violet-300 px-4 py-2 text-sm text-violet-700 disabled:opacity-50"
                    title="2단계 파이프라인으로 주제별 FAQ를 자동 분석·생성합니다"
                  >
                    스마트 FAQ 분석
                  </button>
                  <button
                    type="button"
                    onClick={() => setFaqTargetItem(detail)}
                    disabled={isSaving || !settingsChatbotId}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
                  >
                    FAQ 자동 생성
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

      <style>{`
        .tiptap { outline: none; }
        .tiptap p { margin: 0.5em 0; }
        .tiptap h1 { font-size: 1.4em; font-weight: 700; margin: 0.8em 0 0.4em; }
        .tiptap h2 { font-size: 1.2em; font-weight: 600; margin: 0.7em 0 0.3em; }
        .tiptap h3 { font-size: 1.05em; font-weight: 600; margin: 0.6em 0 0.3em; }
        .tiptap ul, .tiptap ol { padding-left: 1.5em; margin: 0.5em 0; }
        .tiptap blockquote { border-left: 3px solid #e5e7eb; padding-left: 1em; color: #6b7280; margin: 0.5em 0; }
        .tiptap code { background: #f1f5f9; border-radius: 3px; padding: 1px 4px; font-size: 0.9em; font-family: monospace; }
        .tiptap strong { font-weight: 700; }
        .tiptap em { font-style: italic; }
        .tiptap u { text-decoration: underline; }
        .tiptap s { text-decoration: line-through; }
        .tiptap hr { border: none; border-top: 1px solid #e5e7eb; margin: 1em 0; }
        .tiptap img { max-width: 100%; border-radius: 6px; }
        .tiptap table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
        .tiptap th, .tiptap td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 12px; }
        .tiptap th { background: #f9fafb; font-weight: 600; }
        .tiptap a { color: #2563eb; text-decoration: underline; }
      `}</style>

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

      {faqAnalyzeItem && settingsChatbotId ? (
        <FaqAnalyzeModal
          knowledgeId={faqAnalyzeItem.id}
          knowledgeTitle={faqAnalyzeItem.title}
          chatbotId={settingsChatbotId}
          onClose={() => setFaqAnalyzeItem(null)}
          onRegistered={(count) => {
            setFaqAnalyzeItem(null);
            setNotice(`${count}개 FAQ가 등록되었습니다.`);
            void load();
          }}
        />
      ) : null}

      {/* 자동 업데이트 설정 모달 */}
      {syncModalId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => { setSyncModalId(null); setSyncSettings(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: "#111827" }}>자동 업데이트 설정</h3>
            {isSyncLoading ? (
              <div style={{ textAlign: "center", padding: 20 }}><Loader2 style={{ width: 24, height: 24 }} className="animate-spin" /></div>
            ) : (
              <SyncSettingsForm
                initial={syncSettings}
                onSave={async (enabled, intervalDays) => {
                  try {
                    await updateWebSourceSyncSettings(syncModalId, { syncEnabled: enabled, syncIntervalDays: intervalDays });
                    setNotice("자동 업데이트 설정이 저장되었습니다.");
                    setSyncModalId(null);
                    setSyncSettings(null);
                  } catch { setError("설정 저장에 실패했습니다."); }
                }}
                onCancel={() => { setSyncModalId(null); setSyncSettings(null); }}
              />
            )}
          </div>
        </div>
      )}

      </>)}
    </div>
  );
}

function SyncSettingsForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: WebSourceSyncSettings | null;
  onSave: (enabled: boolean, intervalDays: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [enabled, setEnabled] = useState(initial?.syncEnabled ?? false);
  const [intervalDays, setIntervalDays] = useState<number>(initial?.syncIntervalDays ?? 7);
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>자동 업데이트 사용</span>
      </label>
      {enabled && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>업데이트 주기</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([3, 7, 15, 30] as const).map(days => (
              <button key={days} type="button"
                onClick={() => setIntervalDays(days)}
                style={{ padding: "6px 16px", border: `2px solid ${intervalDays === days ? "#2563eb" : "#e5e7eb"}`, borderRadius: 8, background: intervalDays === days ? "#eff6ff" : "#fff", color: intervalDays === days ? "#2563eb" : "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {days}일
              </button>
            ))}
          </div>
          {initial?.nextSyncAt && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
              다음 업데이트: {new Date(initial.nextSyncAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={{ padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151" }}>취소</button>
        <button type="button" disabled={saving}
          onClick={async () => { setSaving(true); await onSave(enabled, enabled ? intervalDays : null); setSaving(false); }}
          style={{ padding: "8px 20px", border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
