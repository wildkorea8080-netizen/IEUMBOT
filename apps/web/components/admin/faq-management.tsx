"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, X, Check, MessageSquare } from "lucide-react";
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

function splitTags(value: string): string[] {
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}

type EditState = {
  question: string;
  answer: string;
  tags: string;
  isActive: boolean;
};

function emptyEdit(): EditState {
  return { question: "", answer: "", tags: "", isActive: true };
}

function itemToEdit(item: FaqManagementItem): EditState {
  return {
    question: item.question,
    answer: item.answer,
    tags: item.tags.join(", "),
    isActive: item.isActive,
  };
}

export function FaqManagement() {
  const [chatbotId, setChatbotId] = useState<string | null>(null);
  const [items, setItems] = useState<FaqManagementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 편집 패널
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [editState, setEditState] = useState<EditState>(emptyEdit());

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
    setEditingId("new");
    setEditState(emptyEdit());
  };

  const openEdit = (item: FaqManagementItem) => {
    setEditingId(item.id);
    setEditState(itemToEdit(item));
  };

  const closeEdit = () => {
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!chatbotId || !editingId) return;
    if (!editState.question.trim() || !editState.answer.trim()) {
      setError("질문과 답변을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (editingId === "new") {
        await createFaqItem({
          chatbotId,
          question: editState.question.trim(),
          answer: editState.answer.trim(),
          tags: splitTags(editState.tags),
        });
        showNotice("FAQ가 등록되었습니다.");
      } else {
        await updateFaqItem(editingId, {
          question: editState.question.trim(),
          answer: editState.answer.trim(),
          tags: splitTags(editState.tags),
          isActive: editState.isActive,
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
    setError(null);
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
    setError(null);
    try {
      await deleteFaqItem(item.id);
      if (editingId === item.id) closeEdit();
      showNotice("삭제되었습니다.");
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 안내 배너 */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "#1e40af" }}>
        FAQ에 등록된 질문은 사용자 질문과 유사도 82% 이상 일치 시 RAG 검색 전에 우선 답변됩니다.
        파일·텍스트 등록 후 AI 분석 → 검토 단계를 통해 자동 등록되거나 직접 추가할 수 있습니다.
      </div>

      {/* 알림 */}
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {notice && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#15803d" }}>{notice}</div>}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
          등록된 FAQ ({items.filter(i => i.isActive).length}개 활성 / {items.length}개 전체)
        </div>
        <button
          type="button"
          onClick={openNew}
          disabled={isSaving || !chatbotId}
          className="btn-primary"
          style={{ fontSize: 13, padding: "7px 14px", display: "flex", alignItems: "center", gap: 5 }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          FAQ 직접 추가
        </button>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
          <Loader2 style={{ width: 24, height: 24, margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
          목록을 불러오는 중입니다.
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <MessageSquare style={{ width: 48, height: 48, color: "#cbd5e1", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#334155", marginBottom: 6 }}>등록된 FAQ가 없습니다</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
            파일·텍스트를 등록하면 AI 분석 후 자동으로 FAQ가 추가됩니다.
            직접 추가 버튼으로 수동 등록도 가능합니다.
          </div>
          <button type="button" onClick={openNew} className="btn-primary" style={{ fontSize: 13 }}>
            FAQ 직접 추가
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                borderBottom: idx < items.length - 1 ? "1px solid #f1f5f9" : "none",
                opacity: item.isActive ? 1 : 0.5,
              }}
            >
              {editingId === item.id ? (
                <FaqEditForm
                  state={editState}
                  onChange={setEditState}
                  onSave={() => void handleSave()}
                  onCancel={closeEdit}
                  isSaving={isSaving}
                />
              ) : (
                <div style={{ display: "flex", gap: 12, padding: "14px 18px", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
                      Q. {item.question}
                    </div>
                    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {item.answer}
                    </div>
                    {item.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                        {item.tags.map(t => (
                          <span key={t} style={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 20, padding: "1px 8px", color: "#6b7280" }}>{t}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 5 }}>
                      {new Date(item.createdAt).toLocaleString("ko-KR")}
                      {item.sourceStagingSessionId && " · AI 분석 자동 등록"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(item)}
                      disabled={isSaving}
                      title={item.isActive ? "비활성화" : "활성화"}
                      style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 5, cursor: "pointer", background: item.isActive ? "#f0fdf4" : "#fff", color: item.isActive ? "#16a34a" : "#9ca3af", fontSize: 11, fontWeight: 500 }}
                    >
                      {item.isActive ? "활성" : "비활성"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      disabled={isSaving}
                      style={{ padding: 5, background: "none", border: "1px solid #e2e8f0", borderRadius: 5, cursor: "pointer", color: "#64748b" }}
                    >
                      <Pencil style={{ width: 12, height: 12 }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      disabled={isSaving}
                      style={{ padding: 5, background: "none", border: "1px solid #fca5a5", borderRadius: 5, cursor: "pointer", color: "#dc2626" }}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 신규 추가 폼 */}
      {editingId === "new" && (
        <div className="bg-white rounded-xl border border-blue-200" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1d4ed8", marginBottom: 14 }}>새 FAQ 추가</div>
          <FaqEditForm
            state={editState}
            onChange={setEditState}
            onSave={() => void handleSave()}
            onCancel={closeEdit}
            isSaving={isSaving}
          />
        </div>
      )}
    </div>
  );
}

function FaqEditForm({
  state,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: {
  state: EditState;
  onChange: (s: EditState) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  return (
    <div style={{ padding: "14px 18px", background: "#f8fafc", display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>질문</span>
        <input
          value={state.question}
          onChange={e => onChange({ ...state, question: e.target.value })}
          placeholder="예: 신청 기간은 언제인가요?"
          className="input-field"
          style={{ fontSize: 13 }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>답변</span>
        <textarea
          value={state.answer}
          onChange={e => onChange({ ...state, answer: e.target.value })}
          placeholder="예: 신청 기간은 매년 3월 1일부터 3월 31일까지입니다."
          rows={4}
          className="input-field"
          style={{ fontSize: 13, resize: "vertical" }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>태그 (쉼표로 구분)</span>
        <input
          value={state.tags}
          onChange={e => onChange({ ...state, tags: e.target.value })}
          placeholder="예: 신청, 기간, 접수"
          className="input-field"
          style={{ fontSize: 13 }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={state.isActive}
          onChange={e => onChange({ ...state, isActive: e.target.checked })}
        />
        활성화
      </label>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", border: "none", borderRadius: 6, background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: isSaving ? 0.6 : 1 }}
        >
          <Check style={{ width: 13, height: 13 }} />
          {isSaving ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer" }}
        >
          <X style={{ width: 13, height: 13 }} />
          취소
        </button>
      </div>
    </div>
  );
}
