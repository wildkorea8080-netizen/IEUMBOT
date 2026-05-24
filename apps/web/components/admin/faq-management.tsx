"use client";

import { useEffect, useRef, useState } from "react";
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

// ── 상세 편집 모달 ─────────────────────────────────────────────────────────────

function FaqDetailModal({
  item,
  chatbotId,
  onClose,
  onSaved,
  onDeleted,
}: {
  item: FaqManagementItem | null; // null = 신규
  chatbotId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editQuestion, setEditQuestion] = useState(item?.question ?? "");
  const [editAnswer, setEditAnswer] = useState(item?.answer ?? "");
  const [editTags, setEditTags] = useState<string[]>(item?.tags ?? []);
  const [editActive, setEditActive] = useState(item?.isActive ?? true);
  const [tagInput, setTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => answerRef.current?.focus(), 50);
  }, []);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !editTags.includes(t)) setEditTags(prev => [...prev, t]);
    setTagInput("");
  };

  const handleSave = async () => {
    if (!editQuestion.trim() || !editAnswer.trim()) {
      setError("질문과 답변을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (!item) {
        await createFaqItem({ chatbotId, question: editQuestion.trim(), answer: editAnswer.trim(), tags: editTags });
      } else {
        await updateFaqItem(item.id, { question: editQuestion.trim(), answer: editAnswer.trim(), tags: editTags, isActive: editActive });
      }
      onSaved();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!confirm(`"${item.question}" FAQ를 삭제하시겠습니까?`)) return;
    setIsDeleting(true);
    try {
      await deleteFaqItem(item.id);
      onDeleted();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 620,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,.18)",
      }}>
        {/* 모달 헤더 */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
            {item ? "FAQ 편집" : "FAQ 직접 추가"}
          </span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* 모달 본문 */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#dc2626", marginBottom: 14 }}>
              {error}
            </div>
          )}

          {/* 질문 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>질문 (주제명)</div>
            <input
              value={editQuestion}
              onChange={e => setEditQuestion(e.target.value)}
              placeholder="예: 신청 기간은 언제인가요?"
              style={{ width: "100%", fontSize: 15, fontWeight: 600, color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", outline: "none", boxSizing: "border-box", background: "#fafafa" }}
            />
          </div>

          {/* 답변 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>답변 내용</div>
            <textarea
              ref={answerRef}
              value={editAnswer}
              onChange={e => setEditAnswer(e.target.value)}
              placeholder="답변 내용을 입력하세요..."
              rows={7}
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", fontSize: 13, lineHeight: 1.8, color: "#374151", background: "#fafafa", outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>

          {/* 활성화 (수정 시) */}
          {item && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)} style={{ width: 14, height: 14 }} />
                활성화 (비활성 시 챗봇 검색에서 제외)
              </label>
            </div>
          )}

          {/* 태그 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8, display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <Tag style={{ width: 11, height: 11 }} />태그
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {editTags.map(tag => (
                <span key={tag} style={{ fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20, padding: "3px 10px", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {tag}
                  <button type="button" onClick={() => setEditTags(prev => prev.filter(t => t !== tag))}
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
        </div>

        {/* 모달 푸터 */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, flexShrink: 0 }}>
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
          <button type="button" onClick={() => void handleSave()} disabled={isSaving || isDeleting}
            style={{ padding: "10px 22px", border: "none", borderRadius: 8, background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: isSaving ? 0.6 : 1 }}>
            {isSaving ? "저장 중..." : "저장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export function FaqManagement() {
  const [chatbotId, setChatbotId] = useState<string | null>(null);
  const [items, setItems] = useState<FaqManagementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 모달: null=닫힘, "new"=신규, item=수정
  const [modalItem, setModalItem] = useState<FaqManagementItem | "new" | null>(null);

  const load = async (cbId?: string) => {
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
        }
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setIsLoading(false);
      }
    };
    void init();
  }, []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };

  const activeCount = items.filter(i => i.isActive).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 모달 */}
      {modalItem !== null && chatbotId && (
        <FaqDetailModal
          item={modalItem === "new" ? null : modalItem}
          chatbotId={chatbotId}
          onClose={() => setModalItem(null)}
          onSaved={async () => {
            setModalItem(null);
            showNotice(modalItem === "new" ? "FAQ가 등록되었습니다." : "FAQ가 수정되었습니다.");
            await load();
          }}
          onDeleted={async () => {
            setModalItem(null);
            showNotice("삭제되었습니다.");
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
        <span style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
          {activeCount}개 활성 / {items.length}개 전체
        </span>
        <button type="button" onClick={() => setModalItem("new")} disabled={!chatbotId}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Plus style={{ width: 14, height: 14 }} />
          FAQ 직접추가
        </button>
      </div>

      {/* 테이블 */}
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
          <div style={{ display: "grid", gridTemplateColumns: "48px 72px 1fr 160px 100px 70px", padding: "10px 16px", borderBottom: "1px solid #f1f5f9", background: "#f9fafb" }}>
            {["구분", "분야", "질문 / 답변 미리보기", "태그", "생성일", "상태"].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</div>
            ))}
          </div>

          {/* 테이블 행 */}
          {items.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => setModalItem(item)}
              style={{
                display: "grid", gridTemplateColumns: "48px 72px 1fr 160px 100px 70px",
                padding: "12px 16px", borderBottom: idx < items.length - 1 ? "1px solid #f1f5f9" : "none",
                cursor: "pointer", transition: "background .12s", alignItems: "center",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {/* 구분 아이콘 */}
              <div>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: item.sourceStagingSessionId ? "#eff6ff" : "#f0fdf4",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15,
                }}>
                  {item.sourceStagingSessionId ? "🤖" : "✏️"}
                </div>
              </div>

              {/* 분야 */}
              <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.sourceStagingSessionId ? "AI자동등록" : "직접입력"}
              </div>

              {/* 질문 + 답변 미리보기 */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                  {item.question}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.answer.replace(/\n/g, " ").slice(0, 60)}{item.answer.length > 60 ? "..." : ""}
                </div>
              </div>

              {/* 태그 */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, overflow: "hidden", maxHeight: 40 }}>
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
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "3px 8px",
                  background: item.isActive ? "#dcfce7" : "#f1f5f9",
                  color: item.isActive ? "#15803d" : "#6b7280",
                }}>
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
