"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, MessageSquare, Tag, X } from "lucide-react";
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

export function FaqManagement() {
  const [chatbotId, setChatbotId] = useState<string | null>(null);
  const [items, setItems] = useState<FaqManagementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 선택된 항목 (null = 없음, "new" = 신규, string = ID)
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);

  // 편집 상태
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const answerRef = useRef<HTMLTextAreaElement>(null);

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

  const openNew = () => {
    setSelectedId("new");
    setEditQuestion("");
    setEditAnswer("");
    setEditTags([]);
    setEditActive(true);
    setTagInput("");
    setIsDirty(false);
    setTimeout(() => answerRef.current?.focus(), 50);
  };

  const openEdit = (item: FaqManagementItem) => {
    setSelectedId(item.id);
    setEditQuestion(item.question);
    setEditAnswer(item.answer);
    setEditTags([...item.tags]);
    setEditActive(item.isActive);
    setTagInput("");
    setIsDirty(false);
  };

  const closeEdit = () => {
    setSelectedId(null);
    setIsDirty(false);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !editTags.includes(t)) {
      setEditTags(prev => [...prev, t]);
      setIsDirty(true);
    }
    setTagInput("");
  };

  const handleSave = async () => {
    if (!chatbotId || !selectedId) return;
    if (!editQuestion.trim() || !editAnswer.trim()) {
      setError("질문과 답변을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (selectedId === "new") {
        await createFaqItem({
          chatbotId,
          question: editQuestion.trim(),
          answer: editAnswer.trim(),
          tags: editTags,
        });
        showNotice("FAQ가 등록되었습니다.");
      } else {
        await updateFaqItem(selectedId, {
          question: editQuestion.trim(),
          answer: editAnswer.trim(),
          tags: editTags,
          isActive: editActive,
        });
        showNotice("FAQ가 수정되었습니다.");
      }
      closeEdit();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (item: FaqManagementItem) => {
    setIsSaving(true);
    try {
      await updateFaqItem(item.id, { isActive: !item.isActive });
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: FaqManagementItem) => {
    if (!confirm(`"${item.question}" FAQ를 삭제하시겠습니까?`)) return;
    setIsSaving(true);
    try {
      await deleteFaqItem(item.id);
      if (selectedId === item.id) closeEdit();
      showNotice("삭제되었습니다.");
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 안내 + 알림 */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "#1e40af" }}>
        FAQ에 등록된 질문은 유사도 82% 이상 일치 시 RAG 검색 전에 우선 답변됩니다.
      </div>
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {notice && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#15803d" }}>{notice}</div>}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
          분석된 주제 ({items.filter(i => i.isActive).length}개 활성 / {items.length}개 전체)
        </span>
        <button type="button" onClick={openNew} disabled={isSaving || !chatbotId}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
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
        <div style={{ display: "flex", gap: 12, minHeight: 420 }}>

          {/* 왼쪽: FAQ 카드 목록 */}
          <div style={{ width: 290, flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <p style={{ fontSize: 11, color: "#9ca3af" }}>주제를 클릭하면 오른쪽에서 내용을 수정할 수 있습니다.</p>
            </div>

            {/* 신규 추가 중일 때 임시 카드 */}
            {selectedId === "new" && (
              <div style={{
                margin: "8px 8px 0", padding: "10px 12px", border: "2px solid #2563eb",
                borderRadius: 10, background: "#eff6ff", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "#f59e0b", color: "#fff", borderRadius: 20, padding: "1px 7px" }}>작업중</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>
                  {editQuestion || "새 FAQ 입력 중..."}
                </div>
                <div style={{ fontSize: 11, color: "#2563eb", marginTop: 4, textAlign: "right" }}>신규등록</div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
              {items.length === 0 && selectedId !== "new" ? (
                <div style={{ textAlign: "center", padding: "40px 16px", color: "#9ca3af", fontSize: 13 }}>
                  <MessageSquare style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.4 }} />
                  등록된 FAQ가 없습니다.<br />
                  직접추가 버튼으로 추가하세요.
                </div>
              ) : (
                items.map(item => (
                  <div key={item.id}
                    onClick={() => openEdit(item)}
                    style={{
                      padding: "10px 12px", borderRadius: 10, marginBottom: 6,
                      border: `2px solid ${selectedId === item.id ? "#2563eb" : "#e5e7eb"}`,
                      background: selectedId === item.id ? "#eff6ff" : "#fff",
                      cursor: "pointer", opacity: item.isActive ? 1 : 0.5,
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: item.isActive ? "#f59e0b" : "#9ca3af", color: "#fff", borderRadius: 20, padding: "1px 7px" }}>
                        {item.isActive ? "활성" : "비활성"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: selectedId === item.id ? "#1d4ed8" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.question}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{item.sourceStagingSessionId ? "AI 자동등록" : "직접입력"}</span>
                      <div style={{ display: "flex", gap: 3 }} onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => void handleToggleActive(item)}
                          title={item.isActive ? "비활성화" : "활성화"}
                          style={{ padding: "2px 6px", border: "1px solid #e2e8f0", borderRadius: 4, background: "#fff", fontSize: 10, cursor: "pointer", color: "#64748b" }}>
                          {item.isActive ? "끔" : "켬"}
                        </button>
                        <button type="button" onClick={() => void handleDelete(item)}
                          style={{ padding: 3, border: "1px solid #fca5a5", borderRadius: 4, background: "#fff", cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center" }}>
                          <Trash2 style={{ width: 10, height: 10 }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 하단 버튼 */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8 }}>
              <button type="button" onClick={closeEdit} disabled={!selectedId}
                style={{ flex: 1, padding: "9px 0", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, cursor: selectedId ? "pointer" : "default", color: "#374151", opacity: selectedId ? 1 : 0.4 }}>
                취소
              </button>
              <button type="button" onClick={() => void handleSave()} disabled={isSaving || !selectedId || !isDirty}
                style={{ flex: 2, padding: "9px 0", border: "none", borderRadius: 8, background: (selectedId && isDirty) ? "#111827" : "#9ca3af", color: "#fff", fontSize: 13, fontWeight: 600, cursor: (selectedId && isDirty) ? "pointer" : "default" }}>
                {isSaving ? "저장 중..." : "등록"}
              </button>
            </div>
          </div>

          {/* 오른쪽: 에디터 패널 */}
          <div style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            {selectedId ? (
              <>
                {/* 질문 (제목) */}
                <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid #f9fafb", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>질문 (주제명)</div>
                  <input
                    value={editQuestion}
                    onChange={e => { setEditQuestion(e.target.value); setIsDirty(true); }}
                    placeholder="예: 신청 기간은 언제인가요?"
                    style={{ width: "100%", fontSize: 18, fontWeight: 700, color: "#111827", border: "none", outline: "none", padding: 0, background: "transparent" }}
                  />
                </div>

                {/* 활성화 토글 (수정 시만 표시) */}
                {selectedId !== "new" && (
                  <div style={{ padding: "8px 20px", borderBottom: "1px solid #f9fafb", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                      <input type="checkbox" checked={editActive} onChange={e => { setEditActive(e.target.checked); setIsDirty(true); }}
                        style={{ width: 14, height: 14 }} />
                      활성화 (비활성 시 챗봇 검색에서 제외)
                    </label>
                  </div>
                )}

                {/* 답변 에디터 */}
                <div style={{ padding: "8px 20px 4px", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>답변 내용</div>
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: "4px 20px 12px" }}>
                  <textarea
                    ref={answerRef}
                    value={editAnswer}
                    onChange={e => { setEditAnswer(e.target.value); setIsDirty(true); }}
                    placeholder="답변 내용을 입력하세요..."
                    style={{
                      width: "100%", minHeight: 180, border: "1px solid #e5e7eb", borderRadius: 8,
                      padding: "12px 14px", fontSize: 13, lineHeight: 1.8, color: "#374151",
                      background: "#fafafa", outline: "none", resize: "vertical", boxSizing: "border-box",
                    }}
                  />
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
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, fontSize: 14, lineHeight: 1 }}>
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
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14, gap: 12 }}>
                <Pencil style={{ width: 36, height: 36, opacity: 0.3 }} />
                <div style={{ textAlign: "center", lineHeight: 1.7 }}>
                  왼쪽에서 FAQ를 선택하거나<br />
                  <strong style={{ color: "#374151" }}>FAQ 직접추가</strong> 버튼을 클릭하세요.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
