"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, Bold, ChevronRight, GitMerge, Heading1, Heading2,
  Italic, List, Loader2, Plus, RotateCcw, Tag,
} from "lucide-react";
import { apiClient } from "../../../../lib/api/client";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type PiiRegion = { start: number; end: number; type: string; preview: string };

type StagingChunk = {
  id: string;
  topicTitle: string;
  content: string;
  tags: string[];
  piiDetected: boolean;
  piiRegions: PiiRegion[];
  mergeCandidateTitle: string | null;
  mergeCandidateId: string | null;
  mergeScore: number | null;
  registrationType: "new" | "merge";
  status: "pending" | "registered" | "skipped";
  sortOrder: number;
};

type StagingSession = {
  sessionId: string;
  chatbotId: string;
  sourceType: string;
  sourceName: string | null;
  status: string;
  totalChunks: number;
  chunks: StagingChunk[];
};

// ── 간단 툴바 (contenteditable 기반) ─────────────────────────────────────────

function EditorToolbar({ onFormat }: { onFormat: (tag: string) => void }) {
  const tools = [
    { icon: <Heading1 style={{ width: 15, height: 15 }} />, tag: "h1", label: "제목1" },
    { icon: <Heading2 style={{ width: 15, height: 15 }} />, tag: "h2", label: "제목2" },
    { icon: <Bold style={{ width: 15, height: 15 }} />, tag: "bold", label: "굵게" },
    { icon: <Italic style={{ width: 15, height: 15 }} />, tag: "italic", label: "기울기" },
    { icon: <List style={{ width: 15, height: 15 }} />, tag: "ul", label: "목록" },
  ];
  return (
    <div style={{ display: "flex", gap: 2, padding: "6px 14px", borderBottom: "1px solid #f1f5f9", background: "#fafafa" }}>
      {tools.map(t => (
        <button key={t.tag} type="button" title={t.label}
          onMouseDown={e => { e.preventDefault(); onFormat(t.tag); }}
          style={{ padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", color: "#374151" }}>
          {t.icon}
        </button>
      ))}
      <div style={{ width: 1, background: "#e5e7eb", margin: "2px 6px" }} />
      <span style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center" }}>선택 후 클릭</span>
    </div>
  );
}

// ── PII 하이라이트 오버레이 ────────────────────────────────────────────────────

function PiiHighlight({ text, regions }: { text: string; regions: PiiRegion[] }) {
  if (!regions.length) return null;
  const nodes: React.ReactNode[] = [];
  let prev = 0;
  for (const r of regions) {
    if (r.start > prev) nodes.push(<span key={`t${prev}`}>{text.slice(prev, r.start)}</span>);
    nodes.push(
      <mark key={`p${r.start}`} title={r.type}
        style={{ background: "#fecaca", color: "#991b1b", borderRadius: 3, padding: "0 2px" }}>
        {text.slice(r.start, r.end)}
      </mark>
    );
    prev = r.end;
  }
  if (prev < text.length) nodes.push(<span key="tail">{text.slice(prev)}</span>);
  return (
    <div style={{ marginTop: 8, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, lineHeight: 1.8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
        <AlertTriangle style={{ width: 11, height: 11 }} />민감정보 위치
      </div>
      {nodes}
    </div>
  );
}

// ── 왼쪽 주제 아이템 ──────────────────────────────────────────────────────────

function ChunkListItem({
  chunk, isSelected, isChecked, onClick, onToggle,
}: {
  chunk: StagingChunk;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "11px 14px",
        borderLeft: `3px solid ${isSelected ? "#2563eb" : "transparent"}`,
        background: isSelected ? "#eff6ff" : chunk.status === "registered" ? "#f0fdf4" : "transparent",
        cursor: "pointer",
        borderBottom: "1px solid #f3f4f6",
        opacity: chunk.status === "skipped" ? 0.4 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* 체크박스 */}
        <div onClick={e => { e.stopPropagation(); if (chunk.status === "pending") onToggle(); }}
          style={{ marginTop: 2, flexShrink: 0, cursor: chunk.status === "pending" ? "pointer" : "default" }}>
          <div style={{
            width: 16, height: 16, borderRadius: 4,
            border: `2px solid ${isChecked ? "#2563eb" : "#d1d5db"}`,
            background: isChecked ? "#2563eb" : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isChecked && <div style={{ width: 8, height: 5, borderLeft: "2px solid #fff", borderBottom: "2px solid #fff", transform: "rotate(-45deg) translate(1px,-1px)" }} />}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 주제명 */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chunk.topicTitle}
          </div>
          {/* 배지들 */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {chunk.status === "registered" ? (
              <span style={{ fontSize: 10, background: "#dcfce7", color: "#15803d", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>등록완료</span>
            ) : chunk.status === "skipped" ? (
              <span style={{ fontSize: 10, background: "#f1f5f9", color: "#64748b", borderRadius: 4, padding: "1px 7px", fontWeight: 600 }}>건너뜀</span>
            ) : chunk.registrationType === "merge" ? (
              <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "1px 7px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 2 }}>
                <GitMerge style={{ width: 9, height: 9 }} />병합 저장
              </span>
            ) : (
              <span style={{ fontSize: 10, background: "#eff6ff", color: "#1d4ed8", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>신규 등록</span>
            )}
            {chunk.piiDetected && (
              <span style={{ fontSize: 10, background: "#fef2f2", color: "#dc2626", borderRadius: 4, padding: "1px 7px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 2 }}>
                <AlertTriangle style={{ width: 9, height: 9 }} />민감정보
              </span>
            )}
          </div>
          {/* 내용 미리보기 */}
          <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chunk.content.slice(0, 60)}
          </div>
        </div>
        <ChevronRight style={{ width: 13, height: 13, color: "#d1d5db", flexShrink: 0, marginTop: 2 }} />
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function KnowledgeReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const editorRef = useRef<HTMLDivElement>(null);

  const [session, setSession] = useState<StagingSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isSavingChunk, setIsSavingChunk] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const load = useCallback(async (polling = false) => {
    if (!sessionId) return;
    if (!polling) setIsLoading(true);
    try {
      const data = await apiClient.request<StagingSession>(`/admin/knowledge/staging/${sessionId}`);

      if (data.status === "analyzing") {
        // 아직 분석 중 — 로딩 유지하면서 3초 후 재폴링
        setTimeout(() => void load(true), 3000);
        return;  // isLoading은 true 유지 (finally 없음)
      }

      if (data.status === "failed") {
        showToast("error", "AI 분석에 실패했습니다. 다시 시도해주세요.");
        setIsLoading(false);
        return;
      }

      setSession(data);
      const pending = new Set(data.chunks.filter(c => c.status === "pending").map(c => c.id));
      setCheckedIds(pending);
      if (data.chunks[0]) selectChunk(data.chunks[0]);
      setIsLoading(false);
    } catch {
      showToast("error", "세션을 불러오지 못했습니다.");
      setIsLoading(false);
    }
  }, [sessionId]); // eslint-disable-line

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(tone: "success" | "error", msg: string) {
    setToast({ tone, msg });
  }

  function selectChunk(chunk: StagingChunk) {
    setSelectedId(chunk.id);
    setEditTitle(chunk.topicTitle);
    setEditContent(chunk.content);
    setEditTags([...chunk.tags]);
    setTagInput("");
    setIsDirty(false);
    // contenteditable 업데이트
    if (editorRef.current) {
      editorRef.current.innerText = chunk.content;
    }
  }

  function handleEditorInput() {
    if (editorRef.current) {
      setEditContent(editorRef.current.innerText);
      setIsDirty(true);
    }
  }

  function handleFormat(tag: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const selected = range.toString();
    if (!selected) return;

    let replacement = selected;
    if (tag === "bold") replacement = `**${selected}**`;
    else if (tag === "italic") replacement = `*${selected}*`;
    else if (tag === "h1") replacement = `\n# ${selected}\n`;
    else if (tag === "h2") replacement = `\n## ${selected}\n`;
    else if (tag === "ul") replacement = selected.split("\n").map(l => `- ${l}`).join("\n");

    range.deleteContents();
    const node = document.createTextNode(replacement);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    if (editorRef.current) {
      setEditContent(editorRef.current.innerText);
      setIsDirty(true);
    }
  }

  function toggleCheck(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!session) return;
    const pending = session.chunks.filter(c => c.status === "pending").map(c => c.id);
    setCheckedIds(checkedIds.size === pending.length ? new Set() : new Set(pending));
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !editTags.includes(t)) {
      setEditTags(prev => [...prev, t]);
      setIsDirty(true);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setEditTags(prev => prev.filter(t => t !== tag));
    setIsDirty(true);
  }

  async function saveChunk() {
    if (!selectedId || !session) return;
    setIsSavingChunk(true);
    try {
      const content = editorRef.current?.innerText ?? editContent;
      await apiClient.request(`/admin/knowledge/staging/${session.sessionId}/chunks/${selectedId}`, {
        method: "PATCH",
        body: { topicTitle: editTitle, content, tags: editTags },
      });
      setSession(prev => prev ? {
        ...prev,
        chunks: prev.chunks.map(c => c.id === selectedId ? { ...c, topicTitle: editTitle, content, tags: editTags } : c),
      } : prev);
      setIsDirty(false);
      showToast("success", "저장되었습니다.");
    } catch { showToast("error", "저장 실패"); }
    finally { setIsSavingChunk(false); }
  }

  async function restoreContent() {
    if (!selectedId || !session) return;
    const original = session.chunks.find(c => c.id === selectedId);
    if (!original) return;
    setEditContent(original.content);
    setEditTitle(original.topicTitle);
    setEditTags([...original.tags]);
    if (editorRef.current) editorRef.current.innerText = original.content;
    setIsDirty(false);
  }

  async function skipChunk(id: string) {
    if (!session) return;
    await apiClient.request(`/admin/knowledge/staging/${session.sessionId}/chunks/${id}`, {
      method: "PATCH", body: { status: "skipped" },
    });
    setCheckedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setSession(prev => prev ? { ...prev, chunks: prev.chunks.map(c => c.id === id ? { ...c, status: "skipped" } : c) } : prev);
  }

  async function registerSelected() {
    if (!session || checkedIds.size === 0) return;
    if (isDirty) { showToast("error", "저장되지 않은 변경이 있습니다. 저장 후 등록하세요."); return; }
    setIsRegistering(true);
    try {
      const result = await apiClient.request<{ registered: number; total: number }>(
        `/admin/knowledge/staging/${session.sessionId}/register`,
        { method: "POST", body: { chunkIds: [...checkedIds] } }
      );
      showToast("success", `${result.registered}개 주제가 등록되었습니다.`);
      await load();
    } catch { showToast("error", "등록 실패"); }
    finally { setIsRegistering(false); }
  }

  async function registerAll() {
    if (!session) return;
    if (isDirty) { showToast("error", "저장되지 않은 변경이 있습니다. 저장 후 등록하세요."); return; }
    setIsRegistering(true);
    try {
      const result = await apiClient.request<{ registered: number; total: number }>(
        `/admin/knowledge/staging/${session.sessionId}/register`,
        { method: "POST", body: { chunkIds: null } }
      );
      showToast("success", `${result.registered}개 주제가 모두 등록되었습니다.`);
      setTimeout(() => router.push("/admin/knowledge/list"), 1200);
    } catch { showToast("error", "등록 실패"); }
    finally { setIsRegistering(false); }
  }

  const selectedChunk = session?.chunks.find(c => c.id === selectedId);
  const pendingCount = session?.chunks.filter(c => c.status === "pending").length ?? 0;
  const registeredCount = session?.chunks.filter(c => c.status === "registered").length ?? 0;

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
        <Loader2 style={{ width: 36, height: 36, animation: "spin 1s linear infinite", color: "#2563eb" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 6 }}>AI가 주제를 분석하고 있습니다</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>파일 크기에 따라 30초~2분 소요될 수 있습니다.</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>창을 닫지 마세요. 3초마다 자동으로 상태를 확인합니다.</div>
        </div>
        <div style={{ width: 200, height: 4, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "#2563eb", borderRadius: 4, animation: "progress 2s ease-in-out infinite", width: "60%" }} />
        </div>
        <style>{`@keyframes progress { 0%{width:10%} 50%{width:80%} 100%{width:10%} }`}</style>
      </div>
    );
  }

  if (!session) {
    return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>세션을 찾을 수 없습니다.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 72px)" }}>

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: toast.tone === "success" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${toast.tone === "success" ? "#bbf7d0" : "#fecaca"}`,
          color: toast.tone === "success" ? "#15803d" : "#dc2626",
          boxShadow: "0 4px 16px rgba(0,0,0,.12)",
        }}>{toast.msg}</div>
      )}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>지식 등록</h1>
            <span style={{ fontSize: 11, fontWeight: 700, background: "linear-gradient(135deg,#06b6d4,#2563eb)", color: "#fff", borderRadius: 6, padding: "2px 8px" }}>도움말</span>
          </div>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            AI가 <strong style={{ color: "#374151" }}>{session.sourceName}</strong>을
            <strong style={{ color: "#2563eb" }}> {session.totalChunks}개</strong> 주제로 분류했습니다.
            각 주제를 확인하고 등록하세요.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => router.push("/admin/knowledge/list")}
            style={{ padding: "9px 16px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151" }}>
            목록으로
          </button>
          <button type="button" onClick={() => void registerAll()} disabled={isRegistering || pendingCount === 0}
            style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: pendingCount === 0 ? "#9ca3af" : "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {isRegistering ? "등록 중..." : "전체 등록"}
          </button>
        </div>
      </div>

      {/* 통계 */}
      <div style={{ display: "flex", gap: 20, marginBottom: 12, flexShrink: 0 }}>
        {[
          { label: "전체", value: session.totalChunks, color: "#374151" },
          { label: "대기", value: pendingCount, color: "#2563eb" },
          { label: "등록완료", value: registeredCount, color: "#16a34a" },
          { label: "선택됨", value: checkedIds.size, color: "#7c3aed" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b7280" }}>
            <span style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* 2-패널 */}
      <div style={{ display: "flex", gap: 12, flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* ① 왼쪽 패널 */}
        <div style={{
          width: 290, flexShrink: 0,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* 패널 헤더 */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>분석된 주제</span>
              <button type="button" onClick={toggleAll}
                style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>
                {checkedIds.size === pendingCount ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
              주제를 클릭하면 오른쪽에서 내용을 확인하고 수정할 수 있습니다.
            </p>
          </div>

          {/* 목록 */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {session.chunks.map(chunk => (
              <ChunkListItem
                key={chunk.id}
                chunk={chunk}
                isSelected={selectedId === chunk.id}
                isChecked={checkedIds.has(chunk.id)}
                onClick={() => selectChunk(chunk)}
                onToggle={() => toggleCheck(chunk.id)}
              />
            ))}
          </div>

          {/* 하단 */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", fontSize: 11, color: "#9ca3af", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" style={{ width: 11, height: 11 }} />1차 주제분류 완료
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" style={{ width: 11, height: 11 }} />2차 통합 지식등록 완료
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button"
                onClick={() => { if (confirm("이 세션을 삭제하시겠습니까?")) router.push("/admin/knowledge/register"); }}
                style={{ flex: 1, padding: "9px 0", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151" }}>
                삭제
              </button>
              <button type="button" onClick={() => void registerSelected()}
                disabled={isRegistering || checkedIds.size === 0}
                style={{ flex: 2, padding: "9px 0", border: "none", borderRadius: 8, background: checkedIds.size === 0 ? "#9ca3af" : "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {isRegistering ? "등록 중..." : `등록 (${checkedIds.size})`}
              </button>
            </div>
          </div>
        </div>

        {/* ② 오른쪽 패널 — 에디터 */}
        <div style={{
          flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14,
          display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0,
        }}>
          {selectedChunk ? (
            <>
              {/* 에디터 헤더 */}
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {/* 상태 배지 */}
                {selectedChunk.piiDetected && (
                  <span style={{ fontSize: 11, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 6, padding: "2px 8px", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <AlertTriangle style={{ width: 11, height: 11 }} />민감정보 포함
                  </span>
                )}
                {selectedChunk.mergeCandidateTitle && (
                  <span style={{ fontSize: 11, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>
                    유사: {selectedChunk.mergeCandidateTitle} ({Math.round((selectedChunk.mergeScore ?? 0) * 100)}%)
                  </span>
                )}
                <div style={{ flex: 1 }} />
                {isDirty && (
                  <button type="button" onClick={() => void restoreContent()}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", fontSize: 12, cursor: "pointer", color: "#6b7280" }}>
                    <RotateCcw style={{ width: 12, height: 12 }} />되돌리기
                  </button>
                )}
                <button type="button" onClick={() => void skipChunk(selectedChunk.id)}
                  disabled={selectedChunk.status !== "pending"}
                  style={{ padding: "5px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", fontSize: 12, cursor: "pointer", color: "#6b7280", opacity: selectedChunk.status !== "pending" ? 0.4 : 1 }}>
                  건너뛰기
                </button>
                <button type="button" onClick={() => void saveChunk()} disabled={isSavingChunk || !isDirty}
                  style={{ padding: "5px 16px", border: "none", borderRadius: 6, background: isDirty ? "#2563eb" : "#9ca3af", color: "#fff", fontSize: 12, fontWeight: 600, cursor: isDirty ? "pointer" : "default" }}>
                  {isSavingChunk ? "저장 중..." : "저장"}
                </button>
              </div>

              {/* 제목 편집 */}
              <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid #f9fafb", flexShrink: 0 }}>
                <input
                  value={editTitle}
                  onChange={e => { setEditTitle(e.target.value); setIsDirty(true); }}
                  placeholder="주제명을 입력하세요"
                  style={{ width: "100%", fontSize: 20, fontWeight: 700, color: "#111827", border: "none", outline: "none", padding: 0, background: "transparent" }}
                />
              </div>

              {/* PII 경고 */}
              {selectedChunk.piiDetected && selectedChunk.piiRegions.length > 0 && (
                <div style={{ margin: "0 18px 0", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#dc2626", flexShrink: 0 }}>
                  <strong>감지된 민감정보:</strong>{" "}
                  {selectedChunk.piiRegions.map((r, i) => (
                    <span key={i} style={{ marginRight: 8 }}>{r.type}({r.preview})</span>
                  ))}
                  — 등록 전 해당 부분을 수정하세요.
                </div>
              )}

              {/* 툴바 */}
              <div style={{ flexShrink: 0 }}>
                <EditorToolbar onFormat={handleFormat} />
              </div>

              {/* 내용 영역 레이블 */}
              <div style={{ padding: "8px 20px 4px", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase" }}>내용</span>
              </div>

              {/* contenteditable 에디터 */}
              <div style={{ flex: 1, overflow: "auto", padding: "0 20px 12px" }}>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  style={{
                    minHeight: 220, outline: "none", fontSize: 13, lineHeight: 1.8,
                    color: "#374151", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 8,
                    background: "#fafafa",
                  }}
                />
                {/* PII 하이라이트 */}
                {selectedChunk.piiDetected && (
                  <PiiHighlight text={selectedChunk.content} regions={selectedChunk.piiRegions} />
                )}
              </div>

              {/* 태그 관리 */}
              <div style={{ padding: "10px 20px 14px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 8, display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                  <Tag style={{ width: 11, height: 11 }} />태그 관리
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {editTags.map(tag => (
                    <span key={tag} style={{ fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20, padding: "3px 10px", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1, fontSize: 12 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    placeholder="태그 입력 후 Enter"
                    style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", fontSize: 12, outline: "none", background: "#fafafa" }}
                  />
                  <button type="button" onClick={addTag}
                    style={{ padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#374151" }}>
                    <Plus style={{ width: 12, height: 12 }} />추가
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
              왼쪽에서 주제를 선택하면 내용을 확인하고 편집할 수 있습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
