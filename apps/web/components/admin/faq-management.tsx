"use client";

import { useEffect, useState } from "react";
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

// ── 편집 모달 ──────────────────────────────────────────────────────────────────

function FaqEditModal({
  item,
  chatbotId,
  onClose,
  onSaved,
  onDeleted,
}: {
  item: FaqManagementItem | null;
  chatbotId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editQuestion, setEditQuestion] = useState(item?.question ?? "");
  const [editCategory, setEditCategory] = useState(item?.category ?? "");
  const [editField, setEditField] = useState(item?.field ?? "");
  const [editTags, setEditTags] = useState<string[]>(item?.tags ?? []);
  const [editActive, setEditActive] = useState(item?.isActive ?? true);
  const [editMemo, setEditMemo] = useState(item?.memo ?? "");
  const [editYoutubeUrl, setEditYoutubeUrl] = useState(item?.youtubeUrl ?? "");
  const [relatedFileTab, setRelatedFileTab] = useState<"file" | "youtube">("file");
  const [tagInput, setTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // HTML 소스 모드 — 디자인된 HTML(인라인 style 포함)을 TipTap이 뭉개지 않고 그대로 저장.
  // 기존 답변이 인라인 style/div/table 등 리치 HTML이면 기본으로 소스 모드(서식모드가 스타일을 지우는 것 방지).
  const [htmlMode, setHtmlMode] = useState(() =>
    /style\s*=|<div|<table|<section|<span/i.test(item?.answer ?? ""),
  );
  const [htmlSource, setHtmlSource] = useState(item?.answer ?? "");

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
    content: item
      ? (item.answer.includes("<") ? item.answer : `<p>${item.answer.replace(/\n/g, "</p><p>")}</p>`)
      : "",
    onUpdate: () => setIsDirty(true),
    editorProps: {
      attributes: {
        style: "min-height: 220px; padding: 14px; outline: none; font-size: 13px; line-height: 1.8; color: #374151;",
      },
    },
  });

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !editTags.includes(t)) { setEditTags(prev => [...prev, t]); setIsDirty(true); }
    setTagInput("");
  };

  const toggleHtmlMode = () => {
    if (!htmlMode) {
      // 서식 → HTML 소스: 현재 편집기 내용을 소스 초기값으로(여기에 디자인 HTML을 붙여넣으면 됨)
      setHtmlSource(editor?.getHTML() ?? htmlSource);
    } else {
      // HTML 소스 → 서식: TipTap에 로드(일부 스타일은 서식모드에서 손실될 수 있음)
      editor?.commands.setContent(htmlSource || "");
    }
    setHtmlMode(m => !m);
  };

  const handleSave = async () => {
    const answerHtml = htmlMode ? htmlSource : (editor?.getHTML() ?? "");
    const answerText = htmlMode
      ? htmlSource.replace(/<[^>]+>/g, "").trim()
      : (editor?.getText() ?? "");
    if (!editQuestion.trim() || !answerText.trim()) {
      setError("질문과 답변을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const catVal = editCategory.trim() || null;
      const fieldVal = editField.trim() || null;
      const memoVal = editMemo.trim() || null;
      const youtubeVal = editYoutubeUrl.trim() || null;
      if (!item) {
        await createFaqItem({ chatbotId, question: editQuestion.trim(), answer: answerHtml, tags: editTags, category: catVal, field: fieldVal, memo: memoVal, youtubeUrl: youtubeVal });
      } else {
        await updateFaqItem(item.id, { question: editQuestion.trim(), answer: answerHtml, tags: editTags, isActive: editActive, category: catVal, field: fieldVal, memo: memoVal, youtubeUrl: youtubeVal });
      }
      onSaved();
    } catch (e) {
      setError(getErrorMessage(e));
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item || !confirm(`"${item.question}" FAQ를 삭제하시겠습니까?`)) return;
    setIsDeleting(true);
    try {
      await deleteFaqItem(item.id);
      onDeleted();
    } catch (e) {
      setError(getErrorMessage(e));
      setIsDeleting(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680,
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,.18)",
        margin: "0 16px",
      }}>
        {/* 헤더 */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>📝</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
              {item ? "FAQ 수정" : "FAQ 직접 추가"}
            </span>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* 본문 스크롤 영역 */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {error && (
            <div style={{ margin: "12px 24px 0", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#dc2626" }}>
              {error}
            </div>
          )}

          {/* 질문 */}
          <div style={{ padding: "16px 24px 12px", borderBottom: "1px solid #f9fafb", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>질문 (주제명)</div>
            <input
              value={editQuestion}
              onChange={e => { setEditQuestion(e.target.value); setIsDirty(true); }}
              placeholder="예: 신청 기간은 언제인가요?"
              style={{ width: "100%", fontSize: 18, fontWeight: 700, color: "#111827", border: "none", outline: "none", padding: 0, background: "transparent", boxSizing: "border-box" }}
            />
          </div>

          {/* 대분류 / 소분류 */}
          <div style={{ padding: "8px 24px 12px", borderBottom: "1px solid #f9fafb", flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>대분류</div>
              <input
                value={editCategory}
                onChange={e => { setEditCategory(e.target.value); setIsDirty(true); }}
                placeholder="예: 민원, 교육, 복지"
                style={{ width: "100%", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", outline: "none", boxSizing: "border-box", background: "#fafafa" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>소분류</div>
              <input
                value={editField}
                onChange={e => { setEditField(e.target.value); setIsDirty(true); }}
                placeholder="예: 행정민원, 초등교육"
                style={{ width: "100%", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", outline: "none", boxSizing: "border-box", background: "#fafafa" }}
              />
            </div>
          </div>

          {/* 활성화 (수정 시) */}
          {item && (
            <div style={{ padding: "8px 24px", borderBottom: "1px solid #f9fafb", flexShrink: 0 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={editActive} onChange={e => { setEditActive(e.target.checked); setIsDirty(true); }} style={{ width: 14, height: 14 }} />
                활성화 (비활성 시 챗봇 검색에서 제외)
              </label>
            </div>
          )}

          {/* 답변 레이블 */}
          <div style={{ padding: "10px 24px 4px", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8 }}>답변 내용</div>
          </div>

          {/* 툴바 + HTML 소스 토글 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0, opacity: htmlMode ? 0.4 : 1, pointerEvents: htmlMode ? "none" : "auto" }}>
              <EditorToolbar editor={editor} />
            </div>
            <button type="button" onClick={toggleHtmlMode}
              title="디자인된 HTML(인라인 style 포함)을 그대로 붙여넣어 저장하려면 켜세요"
              style={{ flexShrink: 0, marginRight: 24, padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                border: `1px solid ${htmlMode ? "#2563eb" : "#e5e7eb"}`, background: htmlMode ? "#eff6ff" : "#fff", color: htmlMode ? "#2563eb" : "#374151" }}>
              {htmlMode ? "✓ HTML 소스 편집" : "</> HTML 소스"}
            </button>
          </div>

          {/* 에디터 또는 HTML 소스 */}
          <div style={{ padding: "0 24px 12px" }}>
            {htmlMode ? (
              <div style={{ marginTop: 8 }}>
                <textarea
                  value={htmlSource}
                  onChange={e => { setHtmlSource(e.target.value); setIsDirty(true); }}
                  placeholder="디자인된 HTML 코드를 붙여넣으세요. 인라인 style(색상·표·여백 등)이 그대로 저장·렌더됩니다."
                  spellCheck={false}
                  style={{ width: "100%", minHeight: 260, boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: 12, fontSize: 12, lineHeight: 1.6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#334155", resize: "vertical" }}
                />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  ⚠️ script·이벤트 핸들러·외부 url()·position:fixed 등 위험 요소는 렌더 시 자동 제거됩니다(레이아웃·색상·표 style은 유지).
                </div>
              </div>
            ) : (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa", marginTop: 8, overflow: "hidden" }}>
                <EditorContent editor={editor} />
              </div>
            )}
          </div>

          {/* 태그 */}
          <div style={{ padding: "10px 24px 16px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 8, display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>
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
                placeholder="새로운 태그 추가"
                style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", fontSize: 12, outline: "none", background: "#fafafa" }} />
              <button type="button" onClick={addTag}
                style={{ padding: "7px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer" }}>
                추가
              </button>
            </div>
          </div>

          {/* 관련 파일 */}
          <div style={{ padding: "10px 24px 16px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>관련 파일</div>
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 10 }}>
              {(["file", "youtube"] as const).map(tab => (
                <button key={tab} type="button"
                  onClick={() => setRelatedFileTab(tab)}
                  style={{ padding: "5px 14px", fontSize: 12, fontWeight: relatedFileTab === tab ? 600 : 400, color: relatedFileTab === tab ? "#2563eb" : "#6b7280", background: "none", border: "none", borderBottom: `2px solid ${relatedFileTab === tab ? "#2563eb" : "transparent"}`, cursor: "pointer", marginBottom: -1 }}>
                  {tab === "file" ? "파일 업로드" : "YouTube 링크"}
                </button>
              ))}
            </div>
            {relatedFileTab === "file" ? (
              <div style={{ border: "2px dashed #e5e7eb", borderRadius: 8, padding: "18px 16px", textAlign: "center", background: "#fafafa" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>파일을 드래그하거나 클릭하여 업로드</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>PDF, DOCX, XLSX (최대 10MB)</div>
              </div>
            ) : (
              <input
                value={editYoutubeUrl}
                onChange={e => { setEditYoutubeUrl(e.target.value); setIsDirty(true); }}
                placeholder="https://www.youtube.com/watch?v=..."
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", fontSize: 12, outline: "none", background: "#fafafa", boxSizing: "border-box" }}
              />
            )}
          </div>

          {/* 버전 메모 */}
          <div style={{ padding: "10px 24px 20px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>버전 메모</div>
            <textarea
              value={editMemo}
              onChange={e => { setEditMemo(e.target.value); setIsDirty(true); }}
              rows={3}
              placeholder="이 FAQ에 대한 변경 내용 또는 메모를 입력하세요."
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", background: "#fafafa", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {/* 푸터 버튼 */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, flexShrink: 0 }}>
          {item && (
            <button type="button" onClick={() => void handleDelete()} disabled={isDeleting || isSaving}
              style={{ padding: "10px 18px", border: "none", borderRadius: 8, background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: isDeleting ? 0.6 : 1 }}>
              {isDeleting ? "삭제 중..." : "삭제하기"}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose}
            style={{ padding: "10px 18px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#374151", fontSize: 13, cursor: "pointer" }}>
            닫기
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving || isDeleting || !isDirty}
            style={{ padding: "10px 22px", border: "none", borderRadius: 8, background: isDirty ? "#16a34a" : "#9ca3af", color: "#fff", fontSize: 13, fontWeight: 600, cursor: isDirty ? "pointer" : "default", opacity: isSaving ? 0.6 : 1 }}>
            {isSaving ? "저장 중..." : "저장하기"}
          </button>
        </div>
      </div>

      {/* TipTap 스타일 */}
      <style>{`
        .tiptap { min-height: 220px; }
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

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export function FaqManagement({ onCountLoaded }: { onCountLoaded?: (count: number) => void }) {
  const [chatbotId, setChatbotId] = useState<string | null>(null);
  const [items, setItems] = useState<FaqManagementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // null = 닫힘, "new" = 신규 추가, FaqManagementItem = 수정
  const [modalTarget, setModalTarget] = useState<FaqManagementItem | "new" | null>(null);

  const load = async (cbId?: string) => {
    const id = cbId ?? chatbotId;
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const res = await listFaqItems(id, true);
      setItems(res.items);
      onCountLoaded?.(res.items.length);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  };

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
          onCountLoaded?.(faqRes.items.length);
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

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(prev =>
      prev.size === items.length ? new Set() : new Set(items.map(i => i.id))
    );
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개 FAQ를 삭제하시겠습니까?`)) return;
    setIsBulkDeleting(true);
    setError(null);
    const count = selectedIds.size;
    try {
      await Promise.all([...selectedIds].map(id => deleteFaqItem(id)));
      setSelectedIds(new Set());
      setNotice(`${count}개 FAQ가 삭제되었습니다.`);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsBulkDeleting(false);
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 편집 모달 */}
      {modalTarget !== null && chatbotId && (
        <FaqEditModal
          item={modalTarget === "new" ? null : modalTarget}
          chatbotId={chatbotId}
          onClose={() => setModalTarget(null)}
          onSaved={async () => {
            setModalTarget(null);
            setNotice(modalTarget === "new" ? "FAQ가 등록되었습니다." : "FAQ가 수정되었습니다.");
            await load();
          }}
          onDeleted={async () => {
            setModalTarget(null);
            setNotice("삭제되었습니다.");
            await load();
          }}
        />
      )}

      {/* 안내 */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "#1e40af" }}>
        FAQ에 등록된 질문은 유사도 82% 이상 일치 시 RAG 검색 전에 우선 답변됩니다.
      </div>
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {notice && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#15803d" }}>{notice}</div>}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
            등록된 FAQ ({items.length})
          </span>
          {items.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#374151", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={selectedIds.size === items.length && items.length > 0}
                ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length; }}
                onChange={toggleAll}
                style={{ width: 15, height: 15, cursor: "pointer" }}
              />
              전체 선택
            </label>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              disabled={isBulkDeleting}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "1px solid #fca5a5", borderRadius: 8, background: "#fff", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: isBulkDeleting ? 0.6 : 1 }}
            >
              <span style={{ fontSize: 14 }}>🗑</span>
              {isBulkDeleting ? "삭제 중..." : `선택 삭제 (${selectedIds.size})`}
            </button>
          )}
          <button type="button" onClick={() => setModalTarget("new")} disabled={!chatbotId}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Plus style={{ width: 14, height: 14 }} />
            FAQ 직접추가
          </button>
        </div>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
          <Loader2 style={{ width: 24, height: 24, margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
          목록을 불러오는 중입니다.
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 16px", color: "#9ca3af", fontSize: 14, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <MessageSquare style={{ width: 36, height: 36, margin: "0 auto 10px", opacity: 0.3 }} />
          등록된 FAQ가 없습니다.<br />
          <span style={{ fontSize: 12, marginTop: 4, display: "block" }}>직접추가 버튼 또는 지식등록 분석 결과에서 FAQ를 추가하세요.</span>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          {/* 테이블 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "44px 100px 130px 1fr 160px 90px 72px", padding: "10px 16px", borderBottom: "1px solid #f1f5f9", background: "#f9fafb", alignItems: "center" }}>
            <div />
            {["구분", "분야", "제목", "태그", "생성일", "상태"].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</div>
            ))}
          </div>

          {/* 테이블 행 */}
          {items.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => setModalTarget(item)}
              style={{
                display: "grid", gridTemplateColumns: "44px 100px 130px 1fr 160px 90px 72px",
                padding: "14px 16px",
                borderBottom: idx < items.length - 1 ? "1px solid #f1f5f9" : "none",
                cursor: "pointer", alignItems: "center",
                background: selectedIds.has(item.id) ? "#eff6ff" : "transparent",
                transition: "background .1s",
              }}
              onMouseEnter={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = "#f8fafc"; }}
              onMouseLeave={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = "transparent"; }}
            >
              {/* 체크박스 */}
              <div onClick={e => toggleSelect(item.id, e)} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${selectedIds.has(item.id) ? "#2563eb" : "#d1d5db"}`,
                  background: selectedIds.has(item.id) ? "#2563eb" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}>
                  {selectedIds.has(item.id) && (
                    <div style={{ width: 8, height: 5, borderLeft: "2px solid #fff", borderBottom: "2px solid #fff", transform: "rotate(-45deg) translate(1px,-1px)" }} />
                  )}
                </div>
              </div>
              {/* 구분 — 대표 키워드 (category 또는 첫 태그) */}
              <div style={{ paddingRight: 8 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600,
                  color: item.sourceStagingSessionId ? "#1d4ed8" : "#15803d",
                  background: item.sourceStagingSessionId ? "#eff6ff" : "#f0fdf4",
                  border: `1px solid ${item.sourceStagingSessionId ? "#bfdbfe" : "#bbf7d0"}`,
                  borderRadius: 6, padding: "3px 8px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  display: "inline-block", maxWidth: "100%",
                }}>
                  {item.category ?? item.tags[0] ?? "FAQ"}
                </div>
              </div>

              {/* 분야 — 대분류/소분류 2-depth */}
              <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5, paddingRight: 8 }}>
                <div style={{ color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.category ?? "-"}
                </div>
                <div style={{ color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.field ?? "-"}
                </div>
              </div>

              {/* 제목 + 미리보기 */}
              <div style={{ minWidth: 0, paddingRight: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.question}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, flexShrink: 0,
                    background: item.sourceStagingSessionId ? "#fef3c7" : "#f1f5f9",
                    color: item.sourceStagingSessionId ? "#b45309" : "#475569",
                  }}>
                    {item.sourceStagingSessionId ? "신규등록" : "직접"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.answer.replace(/<[^>]+>/g, "").slice(0, 60)}{item.answer.length > 60 ? "..." : ""}
                </div>
              </div>

              {/* 태그 */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, overflow: "hidden", maxHeight: 44 }}>
                {item.tags.slice(0, 3).map(tag => (
                  <span key={tag} style={{ fontSize: 10, background: "#f1f5f9", color: "#475569", borderRadius: 20, padding: "2px 7px", whiteSpace: "nowrap" }}>
                    {tag}
                  </span>
                ))}
                {item.tags.length > 3 && (
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>+{item.tags.length - 3}</span>
                )}
              </div>

              {/* 생성일 */}
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {formatDate(item.createdAt)}
              </div>

              {/* 상태 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.isActive ? "#16a34a" : "#d1d5db", display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: item.isActive ? "#15803d" : "#6b7280", fontWeight: 500 }}>
                  {item.isActive ? "활성" : "비활성"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
