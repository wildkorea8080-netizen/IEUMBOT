"use client";

import { useEffect, useState } from "react";
import { Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { apiClient } from "../../../lib/api/client";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type ActionType = "link" | "video" | "file" | "contact";

type ConditionalItem = {
  id: string;
  chatbotId: string;
  name: string;
  triggerKeywords: string[];
  triggerType: string;
  actionType: ActionType;
  actionLabel: string;
  actionValue: string;
  actionDescription?: string;
  isEnabled: boolean;
  priority: number;
  createdAt: string;
};

type ListResponse = { items: ConditionalItem[]; total: number };

function errMsg(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "오류가 발생했습니다.";
}

// 액션 타입 메타
type ActionMeta = {
  label: string;
  icon: string;
  placeholder: string;
  valueLabelText: string;
  valuePlaceholder: string;
  valueHelper: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
};
const ACTION_META: Record<ActionType, ActionMeta> = {
  link: {
    label: "링크 연결유도", icon: "🌐",
    placeholder: "예: 제품 또는 솔루션에 대한 질문이라면",
    valueLabelText: "연결할 링크 주소",
    valuePlaceholder: "예: https://www.company.com/product",
    valueHelper: "고객에게 안내할 웹사이트 주소를 입력하세요.",
    descriptionLabel: "링크 설명",
    descriptionPlaceholder: "예: 제품소개 페이지",
  },
  file: {
    label: "파일 다운로드", icon: "📁",
    placeholder: "예: 제품 또는 솔루션에 대한 질문이라면",
    valueLabelText: "답변에 포함할 파일",
    valuePlaceholder: "https://example.com/file.pdf",
    valueHelper: "고객에게 제공할 파일을 업로드하고 설명을 입력하세요.",
    descriptionLabel: "파일 설명",
    descriptionPlaceholder: "예: 2024년 가격표",
  },
  video: {
    label: "동영상 링크", icon: "🎥",
    placeholder: "예: 제품 또는 솔루션에 대한 질문이라면",
    valueLabelText: "동영상 링크 (YouTube, Vimeo 등)",
    valuePlaceholder: "예: https://youtube.com/watch?v=xxxxx",
    valueHelper: "고객에게 보여줄 동영상의 URL을 입력하세요.",
    descriptionLabel: "동영상 설명",
    descriptionPlaceholder: "예: 제품 사용 가이드",
  },
  contact: {
    label: "전화번호 안내", icon: "📞",
    placeholder: "예: 제품 또는 솔루션에 대한 질문이라면",
    valueLabelText: "전화번호",
    valuePlaceholder: "예: 02-1234-5678",
    valueHelper: "고객에게 안내할 연락처와 운영시간을 입력하세요.",
    descriptionLabel: "운영시간 (선택사항)",
    descriptionPlaceholder: "예: 평일 9-18시",
  },
};

const DEFAULT_FORM = {
  actionType: "" as ActionType | "",
  condition: "",
  actionLabel: "",
  actionValue: "",
  actionDescription: "",
};

// 조건 텍스트 → 트리거 키워드 자동 추출
function extractKeywords(condition: string): string[] {
  const stopwords = new Set(["을", "를", "이", "가", "은", "는", "에", "의", "로", "으로", "할", "때", "하는", "에서", "이나", "도", "만", "라고", "고", "하여", "하면"]);
  return condition
    .split(/[\s,]+/)
    .map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, "").trim())
    .filter(w => w.length >= 2 && !stopwords.has(w))
    .slice(0, 5);
}

// ── 모달 ──────────────────────────────────────────────────────────────────────

function AddModal({
  open, onClose, chatbotId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  chatbotId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setForm(DEFAULT_FORM); setError(null); }
  }, [open]);

  async function save() {
    if (!form.actionType || !form.condition.trim() || !form.actionValue.trim()) {
      setError("액션 타입, 조건, 값은 필수입니다."); return;
    }
    setIsSaving(true); setError(null);
    try {
      const keywords = extractKeywords(form.condition);
      const typeMeta = ACTION_META[form.actionType as ActionType];
      await apiClient.request<ConditionalItem>("/admin/conditional", {
        method: "POST",
        body: {
          chatbotId,
          name: form.condition.trim(),
          triggerKeywords: keywords.length > 0 ? keywords : [form.condition.trim()],
          triggerType: "both",
          actionType: form.actionType,
          actionLabel: typeMeta.label,
          actionValue: form.actionValue.trim(),
          actionDescription: form.actionDescription.trim() || null,
        },
      });
      onSaved(); onClose();
    } catch (e) { setError(errMsg(e)); }
    finally { setIsSaving(false); }
  }

  if (!open) return null;

  const meta = form.actionType ? ACTION_META[form.actionType as ActionType] : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480,
        padding: "28px 28px 24px", boxShadow: "0 20px 60px rgba(0,0,0,.18)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>추가 응답 설정</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* 1. 액션 타입 선택 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            액션 타입 선택
          </label>
          <select
            value={form.actionType}
            onChange={e => setForm(p => ({ ...p, actionType: e.target.value as ActionType | "" }))}
            className="input-field"
            style={{ width: "100%" }}
          >
            <option value="">액션 타입을 선택하세요</option>
            {(Object.entries(ACTION_META) as [ActionType, ActionMeta][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* 2. 조건 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            조건 <span style={{ fontWeight: 400, color: "#6b7280" }}>(언제 이 액션을 실행할까요?)</span>
          </label>
          <input
            value={form.condition}
            onChange={e => setForm(p => ({ ...p, condition: e.target.value }))}
            placeholder={meta?.placeholder ?? "예: 사용자가 자료를 요청할 때"}
            className="input-field"
            style={{ width: "100%" }}
          />
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
            사용자 질문에 해당 조건이 부합할 때, 설정된 행동유도를 이용하여 답합니다.
          </p>
        </div>

        {/* 3. 타입별 필드 */}
        {meta && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                {meta.valueLabelText}
              </label>
              {form.actionType === "file" ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <label style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 8,
                      cursor: "pointer", fontSize: 13, color: "#374151", background: "#f9fafb",
                    }}>
                      파일 선택
                      <input type="file" style={{ display: "none" }} onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setForm(p => ({ ...p, actionLabel: file.name }));
                      }} />
                    </label>
                    {form.actionLabel && (
                      <span style={{ fontSize: 13, color: "#2563eb", fontWeight: 500 }}>{form.actionLabel}</span>
                    )}
                  </div>
                  <input
                    value={form.actionValue}
                    onChange={e => setForm(p => ({ ...p, actionValue: e.target.value }))}
                    placeholder={meta.valuePlaceholder}
                    className="input-field"
                    style={{ width: "100%" }}
                  />
                </div>
              ) : (
                <input
                  value={form.actionValue}
                  onChange={e => setForm(p => ({ ...p, actionValue: e.target.value }))}
                  placeholder={meta.valuePlaceholder}
                  className="input-field"
                  style={{ width: "100%" }}
                />
              )}
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>{meta.valueHelper}</p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                {meta.descriptionLabel}
              </label>
              <input
                value={form.actionDescription}
                onChange={e => setForm(p => ({ ...p, actionDescription: e.target.value }))}
                placeholder={meta.descriptionPlaceholder}
                className="input-field"
                style={{ width: "100%" }}
              />
            </div>
          </>
        )}

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: "11px 0", border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", fontSize: 14, fontWeight: 500, color: "#374151", cursor: "pointer" }}>
            취소
          </button>
          <button type="button" onClick={() => void save()} disabled={isSaving || !form.actionType || !form.condition.trim() || !form.actionValue.trim()}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
              background: (!form.actionType || !form.condition.trim() || !form.actionValue.trim()) ? "#9ca3af" : "#111827",
              fontSize: 14, fontWeight: 600, color: "#fff", cursor: isSaving ? "wait" : "pointer",
            }}>
            {isSaving ? "저장 중..." : "규칙 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function ConditionalPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<ConditionalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getAdminChatbots();
        setChatbots(res.items);
        if (res.items[0]) setChatbotId(res.items[0].id);
      } catch (e) { setError(errMsg(e)); }
    })();
  }, []);

  useEffect(() => { if (chatbotId) void load(); }, [chatbotId]); // eslint-disable-line

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    setIsLoading(true);
    try {
      const res = await apiClient.request<ListResponse>(`/admin/conditional?chatbotId=${chatbotId}`);
      setItems(res.items);
    } catch (e) { setError(errMsg(e)); }
    finally { setIsLoading(false); }
  }

  async function toggle(item: ConditionalItem) {
    try {
      await apiClient.request(`/admin/conditional/${item.id}`, { method: "PATCH", body: { isEnabled: !item.isEnabled } });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, isEnabled: !i.isEnabled } : i));
    } catch (e) { setError(errMsg(e)); }
  }

  async function remove(id: string) {
    if (!confirm("이 조건별 답변 규칙을 삭제하시겠습니까?")) return;
    try {
      await apiClient.request(`/admin/conditional/${id}`, { method: "DELETE" });
      setItems(prev => prev.filter(i => i.id !== id));
      setToast("삭제되었습니다.");
    } catch (e) { setError(errMsg(e)); }
  }

  return (
    <div className="space-y-4">
      {/* 토스트 */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 9999, padding: "12px 20px", borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {toast}
        </div>
      )}

      {/* 페이지 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h1 className="section-title" style={{ margin: 0 }}>조건별 답변 설정</h1>
        <span style={{ fontSize: 11, fontWeight: 700, background: "linear-gradient(135deg,#06b6d4,#2563eb)", color: "#fff", borderRadius: 6, padding: "2px 8px" }}>도움말</span>
      </div>

      {/* 챗봇 선택 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} className="input-field" style={{ width: 220 }}>
          {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && <p style={{ fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</p>}

      {/* AI 응답 추가 설정 카드 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>AI 응답 추가 설정</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
          AI가 응답을 생성한 후, 사전에 설정된 조건에 맞춰 관련 링크·파일·영상 등을 자동으로 첨부해 더 풍부한 정보를 제공합니다.
        </p>

        {isLoading ? (
          <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "24px 16px", background: "#f9fafb", borderRadius: 10, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>등록된 조건별 답변 규칙이 없습니다.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map(item => {
              const meta = ACTION_META[item.actionType as ActionType];
              return (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 16px", border: "1px solid #e5e7eb", borderRadius: 12,
                  background: item.isEnabled ? "#fff" : "#f9fafb",
                  opacity: item.isEnabled ? 1 : 0.6,
                }}>
                  {/* 아이콘 */}
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{meta?.icon ?? "📌"}</span>

                  {/* 내용 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 2 }}>{item.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, background: "#f1f5f9", color: "#475569", borderRadius: 4, padding: "1px 7px", fontWeight: 500 }}>{meta?.label ?? item.actionType}</span>
                      <span style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.actionValue}</span>
                    </div>
                  </div>

                  {/* 토글 */}
                  <button type="button" onClick={() => void toggle(item)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: item.isEnabled ? "#2563eb" : "#94a3b8", flexShrink: 0 }}>
                    {item.isEnabled ? <ToggleRight style={{ width: 24, height: 24 }} /> : <ToggleLeft style={{ width: 24, height: 24 }} />}
                  </button>

                  {/* 삭제 */}
                  <button type="button" onClick={() => void remove(item.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", flexShrink: 0 }}>
                    <Trash2 style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 추가 버튼 */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={!chatbotId}
          style={{
            padding: "11px 22px", borderRadius: 10, border: "none",
            background: chatbotId ? "#111827" : "#9ca3af",
            color: "#fff", fontSize: 14, fontWeight: 600, cursor: chatbotId ? "pointer" : "not-allowed",
          }}
        >
          조건별 답변 규칙 추가
        </button>
      </div>

      <AddModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        chatbotId={chatbotId}
        onSaved={() => { setToast("규칙이 추가되었습니다."); void load(); }}
      />
    </div>
  );
}
