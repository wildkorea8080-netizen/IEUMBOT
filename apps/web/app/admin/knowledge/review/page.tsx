"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight, Eye, GitMerge, Loader2, PenLine, Plus, Shield, Tag,
} from "lucide-react";

// ── Word-level diff (LCS 기반) ────────────────────────────────────────────────

type DiffToken = { type: "equal" | "add" | "remove"; text: string };

function computeWordDiff(original: string, modified: string): DiffToken[] {
  // 단어/공백 단위 토큰화
  const tokenize = (s: string) => s.match(/\S+|\s+|\n/g) ?? [];
  const a = tokenize(original);
  const b = tokenize(modified);
  const m = a.length, n = b.length;

  // 토큰 수가 너무 많으면 라인 단위로 폴백 (O(n²) 방지)
  if (m > 400 || n > 400) return computeLineDiff(original, modified);

  // LCS DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  // 백트래킹
  const result: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "equal", text: a[i - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", text: b[j - 1] }); j--;
    } else {
      result.unshift({ type: "remove", text: a[i - 1] }); i--;
    }
  }
  return result;
}

function computeLineDiff(original: string, modified: string): DiffToken[] {
  const a = original.split("\n"), b = modified.split("\n");
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const result: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "equal", text: a[i - 1] + "\n" }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", text: b[j - 1] + "\n" }); j--;
    } else {
      result.unshift({ type: "remove", text: a[i - 1] + "\n" }); i--;
    }
  }
  return result;
}

// ── Diff 뷰 컴포넌트 ─────────────────────────────────────────────────────────

function DiffView({ original, current, piiRegions }: {
  original: string;
  current: string;
  piiRegions: PiiRegion[];
}) {
  const tokens = computeWordDiff(original, current);

  // PII 구간을 현재 텍스트 기준으로 표시 (add + equal 영역)
  const piiSet = new Set<string>();
  piiRegions.forEach(r => {
    const word = current.slice(r.start, r.end);
    if (word.length >= 3) piiSet.add(word);
  });

  const changed = tokens.some(t => t.type !== "equal");

  if (!changed) {
    return (
      <div style={{ padding: "20px 16px", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
        변경된 내용이 없습니다. 원본과 동일합니다.
      </div>
    );
  }

  return (
    <div>
      {/* 범례 */}
      <div style={{ display: "flex", gap: 16, padding: "8px 14px", background: "#f9fafb", borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#6b7280" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 12, background: "#dcfce7", border: "1px solid #86efac", borderRadius: 2, display: "inline-block" }} />
          새로 추가된 내용
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 12, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 2, display: "inline-block" }} />
          삭제/수정된 내용
        </span>
        {piiSet.size > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 12, background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 2, display: "inline-block" }} />
            민감정보
          </span>
        )}
      </div>

      {/* Diff 본문 */}
      <div style={{
        padding: "14px 16px", fontSize: 13, lineHeight: 1.9,
        whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit",
      }}>
        {tokens.map((token, idx) => {
          const isPii = piiSet.has(token.text.trim());

          if (token.type === "equal") {
            return (
              <span key={idx} style={isPii ? { background: "#fef3c7", borderRadius: 2, padding: "0 1px" } : undefined}>
                {token.text}
              </span>
            );
          }
          if (token.type === "add") {
            return (
              <span key={idx} style={{
                background: isPii ? "#fef3c7" : "#dcfce7",
                color: isPii ? "#92400e" : "#15803d",
                borderRadius: 3, padding: "0 2px",
              }}>
                {token.text}
              </span>
            );
          }
          // remove
          return (
            <span key={idx} style={{
              background: "#fee2e2", color: "#dc2626",
              textDecoration: "line-through", borderRadius: 3, padding: "0 2px",
            }}>
              {token.text}
            </span>
          );
        })}
      </div>

      {/* PII 상세 */}
      {piiRegions.length > 0 && (
        <div style={{ margin: "0 14px 12px", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
          <span style={{ fontWeight: 600 }}>민감정보 위치: </span>
          {piiRegions.map((r, i) => (
            <span key={i} style={{ marginRight: 8 }}>{r.type}({r.preview})</span>
          ))}
        </div>
      )}
    </div>
  );
}
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
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
  mergeOriginalContent: string | null;
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
  isDuplicateFile?: boolean;
  chunks: StagingChunk[];
};

// ── TipTap 툴바 ───────────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, label: string) => (
    <button
      key={label}
      type="button"
      title={label}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={{
        padding: "4px 8px", fontSize: 13, fontWeight: active ? 700 : 400,
        border: `1px solid ${active ? "#2563eb" : "#e5e7eb"}`,
        borderRadius: 5, background: active ? "#eff6ff" : "#fff",
        color: active ? "#2563eb" : "#374151", cursor: "pointer", minWidth: 28,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 3, padding: "8px 14px",
      borderBottom: "1px solid #f1f5f9", background: "#fafafa",
    }}>
      {btn(editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), "H1")}
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2")}
      {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3")}
      <div style={{ width: 1, background: "#e5e7eb", margin: "0 2px" }} />
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "B")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "I")}
      {btn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "U")}
      {btn(editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "S")}
      <div style={{ width: 1, background: "#e5e7eb", margin: "0 2px" }} />
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "• 목록")}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "1. 목록")}
      <div style={{ width: 1, background: "#e5e7eb", margin: "0 2px" }} />
      {btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "인용")}
      {btn(editor.isActive("code"), () => editor.chain().focus().toggleCode().run(), "코드")}
      <div style={{ width: 1, background: "#e5e7eb", margin: "0 2px" }} />
      <button type="button" title="수평선" onMouseDown={e => { e.preventDefault(); editor.chain().focus().setHorizontalRule().run(); }}
        style={{ padding: "4px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, background: "#fff", color: "#374151", cursor: "pointer" }}>
        ─
      </button>
      <button type="button" title="초기화" onMouseDown={e => { e.preventDefault(); editor.chain().focus().clearNodes().unsetAllMarks().run(); }}
        style={{ padding: "4px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, background: "#fff", color: "#6b7280", cursor: "pointer" }}>
        지우기
      </button>
    </div>
  );
}

// ── 왼쪽 주제 아이템 ──────────────────────────────────────────────────────────

function ChunkListItem({ chunk, isSelected, isChecked, onClick, onToggle }: {
  chunk: StagingChunk; isSelected: boolean; isChecked: boolean;
  onClick: () => void; onToggle: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "11px 14px",
        borderLeft: `3px solid ${isSelected ? "#2563eb" : "transparent"}`,
        background: isSelected ? "#eff6ff" : chunk.status === "registered" ? "#f0fdf4" : "transparent",
        cursor: "pointer", borderBottom: "1px solid #f3f4f6",
        opacity: chunk.status === "skipped" ? 0.4 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
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
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chunk.topicTitle}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
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
                <Shield style={{ width: 9, height: 9 }} />민감정보
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chunk.content.replace(/[#*_`>\-]/g, "").slice(0, 50)}
          </div>
        </div>
        <ChevronRight style={{ width: 13, height: 13, color: "#d1d5db", flexShrink: 0, marginTop: 2 }} />
      </div>
    </div>
  );
}

// ── AI 분석 화면 ──────────────────────────────────────────────────────────────

function AnalysisScreen() {
  const [countdown, setCountdown] = useState(60);
  const [step, setStep] = useState(0); // 0: step1 진행, 1: step2 진행, 2: step3 진행

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 5000);
    const t2 = setTimeout(() => setStep(2), 20000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = (60 - countdown) / 60;
  const dashOffset = circumference * (1 - progress);

  type StepStatus = "done" | "active" | "pending";
  const steps: { icon: string; label: string; status: StepStatus }[] = [
    { icon: "📄", label: step >= 1 ? "파일 분석 완료!" : "파일 분석 중...", status: step >= 1 ? "done" : "active" },
    { icon: "📋", label: step >= 2 ? "주제별 분류 완료!" : "주제별 분류 중...", status: step === 0 ? "pending" : step === 1 ? "active" : "done" },
    { icon: "⚙️", label: "기존 지식과 통합 단계", status: step < 2 ? "pending" : "active" },
    { icon: "🔧", label: "컨텐츠 가공 단계", status: "pending" },
  ];

  const borderColor: Record<StepStatus, string> = { done: "#86efac", active: "#93c5fd", pending: "#e5e7eb" };
  const bgColor: Record<StepStatus, string> = { done: "#f0fdf4", active: "#eff6ff", pending: "#f9fafb" };
  const textColor: Record<StepStatus, string> = { done: "#15803d", active: "#1d4ed8", pending: "#9ca3af" };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "40px 48px", textAlign: "center", width: "100%", maxWidth: 440 }}>
        {/* 원형 타이머 */}
        <div style={{ position: "relative", width: 110, height: 110, margin: "0 auto 24px" }}>
          <svg width="110" height="110" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="55" cy="55" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
            <circle
              cx="55" cy="55" r={radius} fill="none"
              stroke="#2563eb" strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "#9ca3af", marginBottom: 1 }}>예상 소요시간</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{countdown}초</span>
          </div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 6 }}>AI가 데이터를 분석하고 있습니다</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>잠시만 기다려주세요. 곧 주제별로 정리해드릴게요!</div>

        {/* 단계 카드 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", border: `1px solid ${borderColor[s.status]}`,
              borderRadius: 12, background: bgColor[s.status],
              position: "relative", overflow: "hidden",
            }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: textColor[s.status], flex: 1, textAlign: "left" }}>{s.label}</span>
              {s.status === "done" && <span style={{ fontSize: 16, color: "#16a34a" }}>✓</span>}
              {s.status === "active" && <Loader2 style={{ width: 16, height: 16, color: "#2563eb", animation: "spin 1s linear infinite", flexShrink: 0 }} />}
              {s.status === "active" && (
                <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, background: "#2563eb", borderRadius: "0 0 0 12px", animation: "progress-bar 2s ease-in-out infinite", width: "60%" }} />
              )}
            </div>
          ))}
        </div>

        <style>{`
          @keyframes progress-bar { 0%{width:10%} 50%{width:80%} 100%{width:10%} }
        `}</style>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

export default function KnowledgeReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [session, setSession] = useState<StagingSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<StagingChunk | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isSavingChunk, setIsSavingChunk] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const originalContentRef = useRef<string>("");
  // 새 필드
  const [versionMemo, setVersionMemo] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [relatedFileTab, setRelatedFileTab] = useState<"file" | "youtube">("file");
  const [skipPiiFilter, setSkipPiiFilter] = useState(false);

  // TipTap 에디터
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "내용을 편집하세요..." }),
    ],
    content: "",
    onUpdate: ({ editor: e }) => { setIsDirty(true); setCurrentText(e.getText()); },
    editorProps: {
      attributes: {
        style: "min-height: 240px; padding: 14px; outline: none; font-size: 13px; line-height: 1.8; color: #374151;",
      },
    },
  });

  const loadChunkIntoEditor = useCallback((chunk: StagingChunk) => {
    setSelectedId(chunk.id);
    setSelectedChunk(chunk);
    setEditTitle(chunk.topicTitle);
    setEditTags([...chunk.tags]);
    setTagInput("");
    setIsDirty(false);
    setCurrentText(chunk.content);
    setVersionMemo("");
    setYoutubeUrl("");
    setSkipPiiFilter(false);
    // merge 청크: 기존 원본이 있으면 diff 자동 활성화
    if (chunk.registrationType === "merge" && chunk.mergeOriginalContent) {
      originalContentRef.current = chunk.mergeOriginalContent;
      setShowDiff(true);
    } else {
      originalContentRef.current = chunk.content;
      setShowDiff(false);
    }

    // TipTap에 마크다운 → HTML 변환 없이 plain text로 설정
    // (StarterKit이 일부 마크다운 파싱)
    if (editor) {
      editor.commands.setContent(
        chunk.content.includes("\n") || chunk.content.includes("#")
          ? markdownToHtml(chunk.content)
          : `<p>${chunk.content.replace(/\n/g, "</p><p>")}</p>`,
      );
    }
  }, [editor]);

  // 간단한 마크다운 → HTML 변환
  function markdownToHtml(md: string): string {
    return md
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\n/g, "<br>")
      .replace(/^(?!<[h|u|l|p])(.+)$/gm, "<p>$1</p>");
  }

  const load = useCallback(async (polling = false) => {
    if (!sessionId) return;
    if (!polling) setIsLoading(true);
    try {
      const data = await apiClient.request<StagingSession>(`/admin/knowledge/staging/${sessionId}`);
      if (data.status === "analyzing") {
        setTimeout(() => void load(true), 3000);
        return;
      }
      if (data.status === "failed") {
        showToast("error", "AI 분석에 실패했습니다.");
        setIsLoading(false);
        return;
      }
      setSession(data);
      const pending = new Set(data.chunks.filter(c => c.status === "pending").map(c => c.id));
      setCheckedIds(pending);
      if (data.chunks[0]) loadChunkIntoEditor(data.chunks[0]);
      setIsLoading(false);
    } catch {
      showToast("error", "세션을 불러오지 못했습니다.");
      setIsLoading(false);
    }
  }, [sessionId, loadChunkIntoEditor]); // eslint-disable-line

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(tone: "success" | "error", msg: string) {
    setToast({ tone, msg });
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
    if (t && !editTags.includes(t)) { setEditTags(prev => [...prev, t]); setIsDirty(true); }
    setTagInput("");
  }

  async function saveChunk() {
    if (!selectedId || !session) return;
    setIsSavingChunk(true);
    try {
      const content = editor?.getText() ? editor.getHTML() : originalContentRef.current;
      await apiClient.request(`/admin/knowledge/staging/${session.sessionId}/chunks/${selectedId}`, {
        method: "PATCH",
        body: { topicTitle: editTitle, content, tags: editTags },
      });
      setSession(prev => prev ? {
        ...prev,
        chunks: prev.chunks.map(c => c.id === selectedId ? { ...c, topicTitle: editTitle, content, tags: editTags } : c),
      } : prev);
      setSelectedChunk(prev => prev ? { ...prev, topicTitle: editTitle, content, tags: editTags } : prev);
      setIsDirty(false);
      showToast("success", "저장되었습니다.");
    } catch { showToast("error", "저장 실패"); }
    finally { setIsSavingChunk(false); }
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
    const hasPii = session.chunks.filter(c => checkedIds.has(c.id) && c.piiDetected);
    if (hasPii.length > 0 && !confirm(`선택된 ${checkedIds.size}개 중 ${hasPii.length}개에 민감정보가 포함되어 있습니다. 계속 등록하시겠습니까?`)) return;
    setIsRegistering(true);
    try {
      const result = await apiClient.request<{ registered: number; total: number }>(
        `/admin/knowledge/staging/${session.sessionId}/register`,
        { method: "POST", body: { chunkIds: [...checkedIds] } }
      );
      showToast("success", `${result.registered}개 주제가 등록되었습니다.`);
      setSession(prev => prev ? {
        ...prev,
        chunks: prev.chunks.map(c => checkedIds.has(c.id) ? { ...c, status: "registered" as const } : c),
      } : prev);
      setCheckedIds(new Set());
      setTimeout(() => router.push("/admin/knowledge/list"), 1500);
    } catch { showToast("error", "등록 실패"); }
    finally { setIsRegistering(false); }
  }


  const pendingCount = session?.chunks.filter(c => c.status === "pending").length ?? 0;
  const registeredCount = session?.chunks.filter(c => c.status === "registered").length ?? 0;
  const piiCount = session?.chunks.filter(c => c.status === "pending" && c.piiDetected).length ?? 0;

  // ── 로딩 화면 ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return <AnalysisScreen />;
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>지식 등록</h1>
            <span style={{ fontSize: 11, fontWeight: 700, background: "linear-gradient(135deg,#06b6d4,#2563eb)", color: "#fff", borderRadius: 6, padding: "2px 8px" }}>도움말</span>
          </div>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            GPT-4.1이 <strong style={{ color: "#374151" }}>{session.sourceName}</strong>을
            <strong style={{ color: "#2563eb" }}> {session.totalChunks}개</strong> 주제로 분류했습니다.
            {piiCount > 0 && <span style={{ marginLeft: 8, color: "#dc2626", fontWeight: 600 }}>⚠ 민감정보 {piiCount}건 포함</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => router.push("/admin/knowledge/list")}
            style={{ padding: "9px 16px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151" }}>
            목록으로
          </button>
        </div>
      </div>

      {/* 파일 중복 여부 배너 */}
      {session.sourceType === "file" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10,
          marginBottom: 10, flexShrink: 0, fontSize: 13,
          background: session.isDuplicateFile ? "#fef9c3" : "#f0fdf4",
          border: `1px solid ${session.isDuplicateFile ? "#fde047" : "#bbf7d0"}`,
          color: session.isDuplicateFile ? "#854d0e" : "#15803d",
        }}>
          <span style={{ fontSize: 18 }}>{session.isDuplicateFile ? "⚠️" : "✅"}</span>
          {session.isDuplicateFile ? (
            <span><strong>중복 파일</strong> — 이미 등록된 파일과 동일한 이름입니다. 파일·텍스트 탭 재학습은 생략되고, 아래 주제로 <strong>FAQ만 등록</strong>됩니다.</span>
          ) : (
            <span><strong>신규 파일</strong> — 파일·텍스트 탭에 자동 등록 및 학습이 시작되었습니다. 아래 주제를 검토하여 <strong>FAQ로 추가</strong>하세요.</span>
          )}
        </div>
      )}

      {/* 통계 */}
      <div style={{ display: "flex", gap: 20, marginBottom: 10, flexShrink: 0, flexWrap: "wrap" }}>
        {[
          { label: "전체", value: session.totalChunks, color: "#374151" },
          { label: "대기", value: pendingCount, color: "#2563eb" },
          { label: "등록완료", value: registeredCount, color: "#16a34a" },
          { label: "선택됨", value: checkedIds.size, color: "#7c3aed" },
          piiCount > 0 ? { label: "민감정보", value: piiCount, color: "#dc2626" } : null,
        ].filter(Boolean).map(s => s && (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b7280" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {/* 2-패널 */}
      <div style={{ display: "flex", gap: 12, flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* ① 왼쪽 패널 */}
        <div style={{ width: 290, flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>분석된 주제</span>
              <button type="button" onClick={toggleAll} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>
                {checkedIds.size === pendingCount ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>주제를 클릭하면 오른쪽 에디터에서 내용을 확인하고 수정할 수 있습니다.</p>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {session.chunks.map(chunk => (
              <ChunkListItem
                key={chunk.id}
                chunk={chunk}
                isSelected={selectedId === chunk.id}
                isChecked={checkedIds.has(chunk.id)}
                onClick={() => loadChunkIntoEditor(chunk)}
                onToggle={() => toggleCheck(chunk.id)}
              />
            ))}
          </div>

        </div>

        {/* ② 오른쪽 패널 — TipTap 에디터 */}
        <div style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {selectedChunk ? (
            <>
              {/* ── 제목 ── */}
              <div style={{ padding: "16px 22px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <input value={editTitle} onChange={e => { setEditTitle(e.target.value); setIsDirty(true); }}
                  placeholder="주제명을 입력하세요"
                  style={{ flex: 1, fontSize: 18, fontWeight: 700, color: "#111827", border: "none", outline: "none", padding: 0, background: "transparent" }} />
                <button type="button" onClick={() => void skipChunk(selectedChunk.id)} disabled={selectedChunk.status !== "pending"}
                  style={{ padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", fontSize: 12, cursor: "pointer", color: "#6b7280", opacity: selectedChunk.status !== "pending" ? 0.4 : 1, flexShrink: 0 }}>
                  건너뛰기
                </button>
                <button type="button" onClick={() => void saveChunk()} disabled={isSavingChunk || !isDirty || showDiff}
                  style={{ padding: "6px 18px", border: "none", borderRadius: 6, background: (isDirty && !showDiff) ? "#2563eb" : "#d1d5db", color: "#fff", fontSize: 12, fontWeight: 600, cursor: (isDirty && !showDiff) ? "pointer" : "default", flexShrink: 0 }}>
                  {isSavingChunk ? "저장 중..." : "저장"}
                </button>
              </div>

              {/* ── 민감한 정보 감지 결과 ── */}
              <div style={{ padding: "10px 22px", borderBottom: "1px solid #f1f5f9", flexShrink: 0, background: "#fafafa" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 7 }}>민감한 정보 감지 결과</div>
                {selectedChunk.piiDetected && selectedChunk.piiRegions.length > 0 ? (() => {
                  const counts: Record<string, number> = {};
                  selectedChunk.piiRegions.forEach(r => { counts[r.type] = (counts[r.type] ?? 0) + 1; });
                  const iconMap: Record<string, string> = { 성명: "👤", 주민번호: "🔒", 전화번호: "📞", 이메일: "@", 계좌번호: "🏦", 신용카드: "💳", 여권번호: "🛂", 주소: "📍" };
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {Object.entries(counts).map(([type, cnt]) => (
                        <span key={type} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", background: "#fff", border: "1px solid #fca5a5", borderRadius: 20, fontSize: 12, color: "#dc2626", fontWeight: 500 }}>
                          <span style={{ fontSize: 13 }}>{iconMap[type] ?? "⚠️"}</span>{type} {cnt}건
                        </span>
                      ))}
                    </div>
                  );
                })() : (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>감지된 민감 정보가 없습니다.</span>
                )}
              </div>

              {/* ── diff 범례 + 변경 보기 토글 ── */}
              <div style={{ padding: "8px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 16, flexShrink: 0, flexWrap: "wrap" }}>
                {[
                  { color: "#fef3c7", border: "#fcd34d", label: "수정된 내용" },
                  { color: "#dcfce7", border: "#86efac", label: "새로 추가된 내용" },
                  { color: "#fee2e2", border: "#fca5a5", label: "민감정보 감지" },
                ].map(item => (
                  <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6b7280" }}>
                    <span style={{ width: 13, height: 13, background: item.color, border: `1px solid ${item.border}`, borderRadius: 3, display: "inline-block", flexShrink: 0 }} />
                    {item.label}
                  </span>
                ))}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setShowDiff(d => !d)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "5px 14px", border: `1px solid ${showDiff ? "#2563eb" : "#e5e7eb"}`,
                    borderRadius: 6, background: showDiff ? "#eff6ff" : "#f9fafb",
                    color: showDiff ? "#2563eb" : "#6b7280", fontSize: 12, cursor: "pointer",
                  }}
                >
                  {showDiff
                    ? <><PenLine style={{ width: 12, height: 12 }} />편집 모드</>
                    : <><Eye style={{ width: 12, height: 12 }} />변경 확인{isDirty && <span style={{ marginLeft: 4, background: "#dc2626", color: "#fff", borderRadius: 99, width: 6, height: 6, display: "inline-block" }} />}</>}
                </button>
              </div>

              {/* ── 병합 안내 ── */}
              {selectedChunk.registrationType === "merge" && selectedChunk.mergeCandidateTitle && (
                <div style={{ margin: "8px 22px 0", padding: "9px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <GitMerge style={{ width: 12, height: 12, flexShrink: 0 }} />
                  기존 지식 <strong>"{selectedChunk.mergeCandidateTitle}"</strong>과 {Math.round((selectedChunk.mergeScore ?? 0) * 100)}% 유사 — AI가 내용을 통합했습니다.
                </div>
              )}

              {/* ── TipTap 툴바 ── */}
              <div style={{ flexShrink: 0, borderBottom: "1px solid #f1f5f9" }}>
                <EditorToolbar editor={editor} />
              </div>

              {/* ── 스크롤 영역: 에디터 + 하단 섹션 ── */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

                {/* 에디터 or Diff */}
                <div style={{ minHeight: 420 }}>
                  {showDiff ? (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", overflow: "hidden", minHeight: 420 }}>
                      <DiffView
                        original={originalContentRef.current}
                        current={currentText || originalContentRef.current}
                        piiRegions={selectedChunk.piiRegions}
                      />
                    </div>
                  ) : (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", minHeight: 420 }}>
                      <EditorContent editor={editor} />
                    </div>
                  )}
                </div>

                {/* AI 개인정보 필터링 */}
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                  <input type="checkbox" checked={skipPiiFilter} onChange={e => setSkipPiiFilter(e.target.checked)} style={{ width: 14, height: 14 }} />
                  AI 개인정보 필터링을 건너뜁니다
                </label>

                {/* 태그 관리 */}
                <div style={{ padding: "14px 16px", background: "#f9fafb", borderRadius: 10, border: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>태그</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {editTags.map(tag => (
                      <span key={tag} style={{ fontSize: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "4px 12px", color: "#374151", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {tag}
                        <button type="button" onClick={() => { setEditTags(prev => prev.filter(t => t !== tag)); setIsDirty(true); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      placeholder="태그 입력 후 Enter"
                      style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", fontSize: 12, outline: "none", background: "#fff" }} />
                    <button type="button" onClick={addTag}
                      style={{ padding: "7px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 12, cursor: "pointer" }}>추가</button>
                  </div>
                </div>

                {/* 관련 파일 */}
                <div style={{ padding: "14px 16px", background: "#f9fafb", borderRadius: 10, border: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>관련 파일 / 영상</div>
                  <div style={{ display: "flex", gap: 0, marginBottom: 10, borderBottom: "1px solid #e5e7eb" }}>
                    {(["file", "youtube"] as const).map(tab => (
                      <button key={tab} type="button" onClick={() => setRelatedFileTab(tab)}
                        style={{ padding: "5px 14px", fontSize: 12, border: "none", background: "none", cursor: "pointer", color: relatedFileTab === tab ? "#111827" : "#6b7280", fontWeight: relatedFileTab === tab ? 700 : 400, borderBottom: relatedFileTab === tab ? "2px solid #111827" : "2px solid transparent", marginBottom: -1 }}>
                        {tab === "file" ? "파일" : "YouTube"}
                      </button>
                    ))}
                  </div>
                  {relatedFileTab === "file" ? (
                    <div style={{ border: "1px dashed #d1d5db", borderRadius: 8, padding: "16px", textAlign: "center", background: "#fff", cursor: "pointer" }}
                      onClick={() => document.getElementById(`file-input-${selectedChunk.id}`)?.click()}>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>클릭하여 파일 선택</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>PDF, 이미지, TXT, HWP, DOCX</div>
                      <input id={`file-input-${selectedChunk.id}`} type="file" style={{ display: "none" }} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.hwp,.docx" />
                    </div>
                  ) : (
                    <input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
                      placeholder="YouTube URL"
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", background: "#fff", boxSizing: "border-box" }} />
                  )}
                </div>

                {/* 버전 메모 */}
                <div style={{ padding: "14px 16px", background: "#f9fafb", borderRadius: 10, border: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>버전 메모</div>
                  <input value={versionMemo} onChange={e => setVersionMemo(e.target.value)}
                    placeholder="100자 이내로 입력해주세요."
                    maxLength={100}
                    style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", background: "#fff", boxSizing: "border-box" }} />
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

      {/* 하단 고정 바 */}
      <div style={{ flexShrink: 0, borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 10 }}>
        {/* 상태 표시줄 */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, flexShrink: 0 }}>✓</span>
            1차 주제분석 분석 완료
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, flexShrink: 0 }}>✓</span>
            2차 통합 지식생성 완료
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: piiCount > 0 ? "#dc2626" : "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, flexShrink: 0 }}>✓</span>
            개인정보 {piiCount}건 감지됨
          </span>
          <span style={{ marginLeft: "auto", color: "#9ca3af" }}>선택하신 주제를 일괄 등록하실 수 있습니다.</span>
        </div>
        {/* 버튼 */}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button"
            onClick={() => { if (confirm("이 세션을 삭제하시겠습니까?")) router.push("/admin/knowledge/register"); }}
            style={{ flex: 1, padding: "12px 0", border: "none", borderRadius: 10, background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            삭제
          </button>
          <button type="button"
            onClick={() => void registerSelected()}
            disabled={isRegistering || checkedIds.size === 0}
            style={{ flex: 2, padding: "12px 0", border: "none", borderRadius: 10, background: checkedIds.size === 0 ? "#9ca3af" : "#111827", color: "#fff", fontSize: 14, fontWeight: 700, cursor: checkedIds.size === 0 ? "default" : "pointer" }}>
            {isRegistering ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>

      {/* TipTap 에디터 기본 스타일 */}
      <style>{`
        .tiptap { min-height: 240px; }
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
        .tiptap .is-editor-empty:first-child::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; float: left; height: 0; }
      `}</style>
    </div>
  );
}
