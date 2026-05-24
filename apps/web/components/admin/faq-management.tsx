"use client";

import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Image } from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { Loader2, MessageSquare, Plus, Tag, X } from "lucide-react";
import { ApiClientError } from "../../lib/api";
import {
  createFaqItem,
  deleteFaqItem,
  getAdminChatbots,
  listFaqItems,
  updateFaqItem,
} from "../../lib/api/admin-operations";
import type { FaqManagementItem } from "../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "처리 중 오류가 발생했습니다.";
}

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
        color: active ? "#2563eb" : "#374151", cursor: "pointer", minWidth: 26,
        lineHeight: 1.4,
      }}
    >{label}</button>
  );

  const sep = () => <div style={{ width: 1, background: "#e5e7eb", margin: "0 2px", alignSelf: "stretch" }} />;

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

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
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 3, padding: "8px 14px",
      borderBottom: "1px solid #f1f5f9", background: "#fafafa", flexShrink: 0,
    }}>
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
      {sep()}
      <button type="button" title="서식 지우기" onMouseDown={e => { e.preventDefault(); editor.chain().focus().clearNodes().unsetAllMarks().run(); }}
        style={{ padding: "3px 7px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff", color: "#6b7280", cursor: "pointer" }}>지우기</button>
    </div>
  );
}

// ── 왼쪽 목록 아이템 ──────────────────────────────────────────────────────────

function FaqListItem({
  item,
  isSelected,
  onClick,
}: {
  item: FaqManagementItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "11px 14px",
        borderLeft: `3px solid ${isSelected ? "#2563eb" : "transparent"}`,
        background: isSelected ? "#eff6ff" : "transparent",
        cursor: "pointer", borderBottom: "1px solid #f3f4f6",
        opacity: item.isActive ? 1 : 0.55,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#1d4ed8" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
            {item.question}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 7px", background: item.isActive ? "#dcfce7" : "#f1f5f9", color: item.isActive ? "#15803d" : "#6b7280" }}>
              {item.isActive ? "활성" : "비활성"}
            </span>
            <span style={{ fontSize: 10, borderRadius: 4, padding: "1px 7px", background: item.sourceStagingSessionId ? "#eff6ff" : "#f0fdf4", color: item.sourceStagingSessionId ? "#1d4ed8" : "#15803d" }}>
              {item.sourceStagingSessionId ? "AI자동" : "직접입력"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

export function FaqManagement() {
  const [chatbotId, setChatbotId] = useState<string | null>(null);
  const [items, setItems] = useState<FaqManagementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // null = 없음 선택, "new" = 신규 작성, string = 기존 아이템 ID
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "답변 내용을 입력하세요..." }),
      Image,
      Table,
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    onUpdate: () => setIsDirty(true),
    editorProps: {
      attributes: {
        style: "min-height: 200px; padding: 14px; outline: none; font-size: 13px; line-height: 1.8; color: #374151;",
      },
    },
  });

  const load = useCallback(async (cbId?: string) => {
    const id = cbId ?? chatbotId;
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await listFaqItems(id, true);
      setItems(res.items);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [chatbotId]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const res = await getAdminChatbots();
        const id = res.items[0]?.id ?? null;
        setChatbotId(id);
        if (id) {
          const faqRes = await listFaqItems(id, true);
          setItems(faqRes.items);
        }
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setIsLoading(false);
      }
    };
    void init();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const openNew = () => {
    setSelectedId("new");
    setEditQuestion("");
    setEditTags([]);
    setEditActive(true);
    setTagInput("");
    setIsDirty(false);
    editor?.commands.setContent("");
  };

  const openEdit = (item: FaqManagementItem) => {
    if (selectedId === item.id) return;
    setSelectedId(item.id);
    setEditQuestion(item.question);
    setEditTags([...item.tags]);
    setEditActive(item.isActive);
    setTagInput("");
    setIsDirty(false);
    editor?.commands.setContent(
      item.answer.includes("<") ? item.answer : `<p>${item.answer.replace(/\n/g, "</p><p>")}</p>`
    );
  };

  const closePanel = () => {
    setSelectedId(null);
    setIsDirty(false);
    editor?.commands.setContent("");
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !editTags.includes(t)) { setEditTags(prev => [...prev, t]); setIsDirty(true); }
    setTagInput("");
  };

  const handleSave = async () => {
    if (!chatbotId || !selectedId) return;
    const answerHtml = editor?.getHTML() ?? "";
    const answerText = editor?.getText() ?? "";
    if (!editQuestion.trim() || !answerText.trim()) {
      setError("질문과 답변을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (selectedId === "new") {
        await createFaqItem({ chatbotId, question: editQuestion.trim(), answer: answerHtml, tags: editTags });
        setNotice("FAQ가 등록되었습니다.");
      } else {
        await updateFaqItem(selectedId, { question: editQuestion.trim(), answer: answerHtml, tags: editTags, isActive: editActive });
        setNotice("FAQ가 수정되었습니다.");
      }
      closePanel();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || selectedId === "new") return;
    const item = items.find(i => i.id === selectedId);
    if (!item || !confirm(`"${item.question}" FAQ를 삭제하시겠습니까?`)) return;
    setIsSaving(true);
    try {
      await deleteFaqItem(selectedId);
      setNotice("삭제되었습니다.");
      closePanel();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const pendingItem = selectedId === "new";
  const activeCount = items.filter(i => i.isActive).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 안내 + 알림 */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "#1e40af" }}>
        FAQ에 등록된 질문은 유사도 82% 이상 일치 시 RAG 검색 전에 우선 답변됩니다.
      </div>
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {notice && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#15803d" }}>{notice}</div>}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
          {activeCount}개 활성 / {items.length}개 전체
        </span>
        <button type="button" onClick={openNew} disabled={!chatbotId || pendingItem}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: pendingItem ? 0.5 : 1 }}>
          <Plus style={{ width: 14, height: 14 }} />
          FAQ 직접추가
        </button>
      </div>

      {/* 2-패널 */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
          <Loader2 style={{ width: 24, height: 24, margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
          목록을 불러오는 중입니다.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, minHeight: 500 }}>

          {/* 왼쪽: 목록 */}
          <div style={{ width: 270, flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
              <p style={{ fontSize: 11, color: "#9ca3af" }}>주제를 클릭하면 오른쪽 에디터에서 수정할 수 있습니다.</p>
            </div>

            {/* 신규 작성 중 임시 카드 */}
            {pendingItem && (
              <div style={{ margin: "8px 8px 0", padding: "10px 12px", border: "2px solid #2563eb", borderRadius: 10, background: "#eff6ff", flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, background: "#f59e0b", color: "#fff", borderRadius: 20, padding: "1px 7px" }}>작업중</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {editQuestion || "새 FAQ 입력 중..."}
                </div>
                <div style={{ fontSize: 11, color: "#2563eb", marginTop: 3, textAlign: "right" }}>신규등록</div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto" }}>
              {items.length === 0 && !pendingItem ? (
                <div style={{ textAlign: "center", padding: "40px 16px", color: "#9ca3af", fontSize: 13 }}>
                  <MessageSquare style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.4 }} />
                  등록된 FAQ가 없습니다.
                </div>
              ) : (
                items.map(item => (
                  <FaqListItem
                    key={item.id}
                    item={item}
                    isSelected={selectedId === item.id}
                    onClick={() => openEdit(item)}
                  />
                ))
              )}
            </div>
          </div>

          {/* 오른쪽: 에디터 패널 */}
          <div style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            {selectedId ? (
              <>
                {/* 제목 (질문) */}
                <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid #f9fafb", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>질문 (주제명)</div>
                  <input
                    value={editQuestion}
                    onChange={e => { setEditQuestion(e.target.value); setIsDirty(true); }}
                    placeholder="예: 신청 기간은 언제인가요?"
                    style={{ width: "100%", fontSize: 18, fontWeight: 700, color: "#111827", border: "none", outline: "none", padding: 0, background: "transparent" }}
                  />
                </div>

                {/* 활성화 토글 (수정 시) */}
                {selectedId !== "new" && (
                  <div style={{ padding: "8px 20px", borderBottom: "1px solid #f9fafb", flexShrink: 0 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                      <input type="checkbox" checked={editActive} onChange={e => { setEditActive(e.target.checked); setIsDirty(true); }} style={{ width: 14, height: 14 }} />
                      활성화 (비활성 시 챗봇 검색에서 제외)
                    </label>
                  </div>
                )}

                {/* 답변 레이블 */}
                <div style={{ padding: "8px 20px 4px", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>답변 내용</div>
                </div>

                {/* 툴바 */}
                <EditorToolbar editor={editor} />

                {/* 에디터 */}
                <div style={{ flex: 1, overflow: "auto", padding: "0 20px 12px" }}>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa", marginTop: 8 }}>
                    <EditorContent editor={editor} />
                  </div>
                </div>

                {/* 태그 */}
                <div style={{ padding: "10px 20px 14px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 8, display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                    <Tag style={{ width: 11, height: 11 }} />태그 관리
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {editTags.map(tag => (
                      <span key={tag} style={{ fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20, padding: "3px 10px", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {tag}
                        <button type="button" onClick={() => { setEditTags(prev => prev.filter(t => t !== tag)); setIsDirty(true); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>
                          <X style={{ width: 11, height: 11 }} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      placeholder="태그 입력 후 Enter"
                      style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", fontSize: 12, outline: "none", background: "#fafafa" }} />
                    <button type="button" onClick={addTag}
                      style={{ padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <Plus style={{ width: 12, height: 12 }} />추가
                    </button>
                  </div>
                </div>

                {/* 하단 버튼 */}
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, flexShrink: 0 }}>
                  {selectedId !== "new" && (
                    <button type="button" onClick={() => void handleDelete()} disabled={isSaving}
                      style={{ padding: "10px 18px", border: "none", borderRadius: 8, background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: isSaving ? 0.6 : 1 }}>
                      삭제하기
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={closePanel}
                    style={{ padding: "10px 18px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#374151", fontSize: 13, cursor: "pointer" }}>
                    닫기
                  </button>
                  <button type="button" onClick={() => void handleSave()} disabled={isSaving || !isDirty}
                    style={{ padding: "10px 22px", border: "none", borderRadius: 8, background: isDirty ? "#16a34a" : "#9ca3af", color: "#fff", fontSize: 13, fontWeight: 600, cursor: isDirty ? "pointer" : "default", opacity: isSaving ? 0.6 : 1 }}>
                    {isSaving ? "저장 중..." : "저장하기"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14, gap: 12 }}>
                <MessageSquare style={{ width: 36, height: 36, opacity: 0.25 }} />
                <div style={{ textAlign: "center", lineHeight: 1.7 }}>
                  왼쪽에서 FAQ를 선택하거나<br />
                  <strong style={{ color: "#374151" }}>FAQ 직접추가</strong> 버튼을 클릭하세요.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TipTap 스타일 */}
      <style>{`
        .tiptap { min-height: 200px; }
        .tiptap p { margin: 0.5em 0; }
        .tiptap h1 { font-size: 1.5em; font-weight: 700; margin: 0.8em 0 0.4em; }
        .tiptap h2 { font-size: 1.25em; font-weight: 600; margin: 0.7em 0 0.3em; }
        .tiptap h3 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
        .tiptap ul, .tiptap ol { padding-left: 1.5em; margin: 0.5em 0; }
        .tiptap li { margin: 0.2em 0; }
        .tiptap blockquote { border-left: 3px solid #e5e7eb; padding-left: 1em; color: #6b7280; margin: 0.5em 0; }
        .tiptap code { background: #f1f5f9; border-radius: 3px; padding: 1px 4px; font-family: monospace; font-size: 0.9em; }
        .tiptap strong { font-weight: 700; }
        .tiptap em { font-style: italic; }
        .tiptap u { text-decoration: underline; }
        .tiptap s { text-decoration: line-through; }
        .tiptap hr { border: none; border-top: 1px solid #e5e7eb; margin: 1em 0; }
        .tiptap img { max-width: 100%; border-radius: 6px; }
        .tiptap table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
        .tiptap th, .tiptap td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 13px; }
        .tiptap th { background: #f9fafb; font-weight: 600; }
        .tiptap a { color: #2563eb; text-decoration: underline; }
        .tiptap .is-editor-empty:first-child::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; float: left; height: 0; }
      `}</style>
    </div>
  );
}
