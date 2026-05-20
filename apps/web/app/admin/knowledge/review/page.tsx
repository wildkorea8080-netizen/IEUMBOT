"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckSquare, Square, AlertTriangle, GitMerge, Plus, Tag, ChevronRight, Loader2 } from "lucide-react";
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

// ── PII 하이라이트 렌더러 ──────────────────────────────────────────────────────

function renderPiiHighlight(text: string, regions: PiiRegion[]): React.ReactNode[] {
  if (!regions.length) return [<span key="all">{text}</span>];
  const nodes: React.ReactNode[] = [];
  let prev = 0;
  for (const r of regions) {
    if (r.start > prev) nodes.push(<span key={`t${prev}`}>{text.slice(prev, r.start)}</span>);
    nodes.push(
      <mark key={`pii${r.start}`} title={r.type} style={{ background: "#fecaca", color: "#991b1b", borderRadius: 3, padding: "0 2px", cursor: "help" }}>
        {text.slice(r.start, r.end)}
      </mark>
    );
    prev = r.end;
  }
  if (prev < text.length) nodes.push(<span key="tail">{text.slice(prev)}</span>);
  return nodes;
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function KnowledgeReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [session, setSession] = useState<StagingSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [isSavingChunk, setIsSavingChunk] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await apiClient.request<StagingSession>(`/admin/knowledge/staging/${sessionId}`);
      setSession(data);
      const pending = new Set(data.chunks.filter(c => c.status === "pending").map(c => c.id));
      setCheckedIds(pending);
      if (data.chunks[0] && !selectedId) {
        const first = data.chunks[0];
        setSelectedId(first.id);
        setEditTitle(first.topicTitle);
        setEditContent(first.content);
        setEditTags(first.tags.join(", "));
      }
    } catch { showToast("error", "세션을 불러오지 못했습니다."); }
    finally { setIsLoading(false); }
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
    setEditTags(chunk.tags.join(", "));
    setTagInput("");
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
    if (checkedIds.size === pending.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(pending));
  }

  async function saveChunk() {
    if (!selectedId || !session) return;
    setIsSavingChunk(true);
    try {
      const tags = editTags.split(",").map(t => t.trim()).filter(Boolean);
      await apiClient.request(`/admin/knowledge/staging/${session.sessionId}/chunks/${selectedId}`, {
        method: "PATCH",
        body: { topicTitle: editTitle, content: editContent, tags },
      });
      setSession(prev => prev ? {
        ...prev,
        chunks: prev.chunks.map(c => c.id === selectedId ? { ...c, topicTitle: editTitle, content: editContent, tags } : c),
      } : prev);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, color: "#6b7280" }}>
        <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} />
        AI가 주제를 분석하고 있습니다...
      </div>
    );
  }

  if (!session) {
    return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>세션을 찾을 수 없습니다.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      {/* 토스트 */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: toast.tone === "success" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${toast.tone === "success" ? "#bbf7d0" : "#fecaca"}`,
          color: toast.tone === "success" ? "#15803d" : "#dc2626",
          boxShadow: "0 4px 12px rgba(0,0,0,.1)",
        }}>{toast.msg}</div>
      )}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>지식 등록</h1>
            <span style={{ fontSize: 11, fontWeight: 700, background: "linear-gradient(135deg,#06b6d4,#2563eb)", color: "#fff", borderRadius: 6, padding: "2px 8px" }}>도움말</span>
          </div>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            AI가 <strong>{session.sourceName}</strong>을 {session.totalChunks}개 주제로 분류했습니다. 각 주제를 확인하고 등록하세요.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => router.push("/admin/knowledge/list")}
            style={{ padding: "9px 16px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151" }}>
            목록으로
          </button>
          <button type="button" onClick={() => void registerAll()} disabled={isRegistering || pendingCount === 0}
            style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: isRegistering || pendingCount === 0 ? "#9ca3af" : "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {isRegistering ? "등록 중..." : "전체 등록"}
          </button>
        </div>
      </div>

      {/* 통계 바 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12, flexShrink: 0 }}>
        {[
          { label: "전체", value: session.totalChunks, color: "#6b7280" },
          { label: "대기", value: pendingCount, color: "#2563eb" },
          { label: "등록 완료", value: registeredCount, color: "#16a34a" },
          { label: "선택됨", value: checkedIds.size, color: "#7c3aed" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color }}>{value}</span>
            <span style={{ color: "#9ca3af" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* 2-패널 레이아웃 */}
      <div style={{ display: "flex", gap: 12, flex: 1, overflow: "hidden" }}>

        {/* ① 왼쪽 패널 — 분류된 주제 목록 */}
        <div style={{
          width: 300, flexShrink: 0,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* 패널 헤더 */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>분석된 주제</span>
              <button type="button" onClick={toggleAll} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>
                {checkedIds.size === pendingCount ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "#9ca3af" }}>주제를 클릭하면 오른쪽에서 내용을 확인하고 수정할 수 있습니다.</p>
          </div>

          {/* 주제 목록 */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {session.chunks.map(chunk => (
              <div
                key={chunk.id}
                onClick={() => selectChunk(chunk)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 14px",
                  background: selectedId === chunk.id ? "#eff6ff" : "transparent",
                  borderLeft: `3px solid ${selectedId === chunk.id ? "#2563eb" : "transparent"}`,
                  cursor: "pointer", transition: "background 0.1s",
                  opacity: chunk.status === "registered" ? 0.5 : 1,
                }}
              >
                {/* 체크박스 */}
                <div onClick={e => { e.stopPropagation(); if (chunk.status === "pending") toggleCheck(chunk.id); }}
                  style={{ paddingTop: 2, flexShrink: 0, cursor: chunk.status === "pending" ? "pointer" : "default" }}>
                  {checkedIds.has(chunk.id)
                    ? <CheckSquare style={{ width: 15, height: 15, color: "#2563eb" }} />
                    : <Square style={{ width: 15, height: 15, color: "#d1d5db" }} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {chunk.topicTitle}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {chunk.status === "registered" ? (
                      <span style={{ fontSize: 10, background: "#dcfce7", color: "#15803d", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>등록완료</span>
                    ) : chunk.registrationType === "merge" ? (
                      <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "1px 6px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2 }}>
                        <GitMerge style={{ width: 9, height: 9 }} />병합 저장
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, background: "#eff6ff", color: "#1d4ed8", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>신규 등록</span>
                    )}
                    {chunk.piiDetected && (
                      <span style={{ fontSize: 10, background: "#fef2f2", color: "#dc2626", borderRadius: 4, padding: "1px 6px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2 }}>
                        <AlertTriangle style={{ width: 9, height: 9 }} />민감정보
                      </span>
                    )}
                  </div>
                  {/* 신규 등록 버튼 */}
                  {chunk.status === "pending" && (
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setCheckedIds(new Set([chunk.id])); void registerSelected(); }}
                      style={{ marginTop: 6, fontSize: 11, padding: "3px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", cursor: "pointer", color: "#374151" }}>
                      신규 등록
                    </button>
                  )}
                </div>
                <ChevronRight style={{ width: 13, height: 13, color: "#d1d5db", flexShrink: 0, marginTop: 4 }} />
              </div>
            ))}
          </div>

          {/* 하단 액션 */}
          <div style={{ padding: "12px 14px", borderTop: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 4, fontSize: 11, color: "#6b7280" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" style={{ width: 12, height: 12 }} /> 1차 주제분류 완료
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" style={{ width: 12, height: 12 }} /> 2차 통합 지식등록 완료
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => router.push("/admin/knowledge/list")}
                style={{ flex: 1, padding: "9px 0", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151" }}>
                삭제
              </button>
              <button type="button" onClick={() => void registerSelected()} disabled={isRegistering || checkedIds.size === 0}
                style={{ flex: 2, padding: "9px 0", border: "none", borderRadius: 8, background: checkedIds.size === 0 ? "#9ca3af" : "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {isRegistering ? "등록 중..." : `등록 (${checkedIds.size})`}
              </button>
            </div>
          </div>
        </div>

        {/* ② 오른쪽 패널 — 주제 내용 에디터 */}
        <div style={{
          flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {selectedChunk ? (
            <>
              {/* 에디터 헤더 */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontWeight: 700, color: "#111827", fontSize: 15 }}>
                  {selectedChunk.piiDetected
                    ? <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600, marginRight: 8, display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <AlertTriangle style={{ width: 12, height: 12 }} />민감정보 포함
                      </span>
                    : null}
                  {selectedChunk.mergeCandidateTitle
                    ? <span style={{ color: "#92400e", fontSize: 12, fontWeight: 600, marginRight: 8 }}>
                        유사 지식: {selectedChunk.mergeCandidateTitle} ({Math.round((selectedChunk.mergeScore ?? 0) * 100)}%)
                      </span>
                    : null}
                  핵심 가치
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => void skipChunk(selectedChunk.id)} disabled={selectedChunk.status !== "pending"}
                    style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", fontSize: 12, cursor: "pointer", color: "#6b7280", opacity: selectedChunk.status !== "pending" ? 0.4 : 1 }}>
                    건너뛰기
                  </button>
                  <button type="button" onClick={() => void saveChunk()} disabled={isSavingChunk}
                    style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: isSavingChunk ? 0.6 : 1 }}>
                    {isSavingChunk ? "저장 중..." : "저장"}
                  </button>
                </div>
              </div>

              {/* 제목 편집 */}
              <div style={{ padding: "14px 20px 0", borderBottom: "1px solid #f9fafb" }}>
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="주제명"
                  style={{ width: "100%", fontSize: 20, fontWeight: 700, color: "#111827", border: "none", outline: "none", padding: 0 }}
                />
              </div>

              {/* 민감정보 경고 */}
              {selectedChunk.piiDetected && selectedChunk.piiRegions.length > 0 && (
                <div style={{ margin: "10px 20px 0", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>
                  <strong>민감정보 감지:</strong>{" "}
                  {selectedChunk.piiRegions.map((r, i) => (
                    <span key={i} style={{ marginRight: 8 }}>{r.type} ({r.preview})</span>
                  ))}
                  — 등록 전 내용을 확인하고 수정하세요.
                </div>
              )}

              {/* 내용 에디터 */}
              <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>내용</div>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  style={{
                    width: "100%", minHeight: 280, border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: "12px 14px", fontSize: 13, lineHeight: 1.7, color: "#374151",
                    resize: "vertical", outline: "none", fontFamily: "inherit",
                  }}
                />
                {/* PII 하이라이트 미리보기 */}
                {selectedChunk.piiDetected && (
                  <div style={{ marginTop: 8, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, lineHeight: 1.8, color: "#374151" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>민감정보 위치 미리보기</div>
                    {renderPiiHighlight(selectedChunk.content, selectedChunk.piiRegions)}
                  </div>
                )}
              </div>

              {/* 태그 관리 */}
              <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                  <Tag style={{ width: 11, height: 11 }} />태그 관리
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {editTags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} style={{ fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "2px 10px", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {tag}
                      <button type="button"
                        onClick={() => setEditTags(editTags.split(",").map(t => t.trim()).filter(t => t && t !== tag).join(", "))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 11, padding: 0 }}>✕</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const t = tagInput.trim();
                        if (t) { setEditTags(prev => prev ? `${prev}, ${t}` : t); setTagInput(""); }
                      }
                    }}
                    placeholder="태그 입력 후 Enter"
                    style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none" }}
                  />
                  <button type="button"
                    onClick={() => { const t = tagInput.trim(); if (t) { setEditTags(prev => prev ? `${prev}, ${t}` : t); setTagInput(""); } }}
                    style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#374151" }}>
                    <Plus style={{ width: 12, height: 12 }} />추가
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
              왼쪽 목록에서 주제를 선택하면 내용을 확인하고 편집할 수 있습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
