"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

import { AdminModal } from "../../../components/ui/admin-modal";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { apiClient } from "../../../lib/api/client";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type TriggerType = "question" | "answer" | "both";
type ActionType  = "link" | "video" | "file" | "contact";

type ConditionalItem = {
  id: string;
  chatbotId: string;
  name: string;
  triggerKeywords: string[];
  triggerType: TriggerType;
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

const ACTION_ICONS: Record<ActionType, string> = { link: "🔗", video: "🎬", file: "📎", contact: "📞" };
const ACTION_LABELS: Record<ActionType, string> = { link: "링크", video: "동영상", file: "파일", contact: "연락처" };
const TRIGGER_LABELS: Record<TriggerType, string> = { question: "질문", answer: "답변", both: "질문+답변" };

const DEFAULT_FORM = {
  name: "", triggerKeywords: [] as string[], keywordInput: "",
  triggerType: "both" as TriggerType, actionType: "link" as ActionType,
  actionLabel: "", actionValue: "", actionDescription: "",
};

export default function ConditionalPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<ConditionalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getAdminChatbots();
        setChatbots(res.items);
        if (res.items[0]) setChatbotId(res.items[0].id);
      } catch (e) { setError(errMsg(e)); }
    })();
  }, []);

  useEffect(() => {
    if (!chatbotId) return;
    void load();
  }, [chatbotId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function save() {
    if (!form.name.trim() || !chatbotId) return;
    setIsSaving(true);
    setError(null);
    try {
      await apiClient.request<ConditionalItem>("/admin/conditional", {
        method: "POST",
        body: {
          chatbotId,
          name: form.name.trim(),
          triggerKeywords: form.triggerKeywords,
          triggerType: form.triggerType,
          actionType: form.actionType,
          actionLabel: form.actionLabel.trim(),
          actionValue: form.actionValue.trim(),
          actionDescription: form.actionDescription.trim() || null,
        },
      });
      setIsModalOpen(false);
      setForm(DEFAULT_FORM);
      setToast("조건이 추가되었습니다.");
      await load();
    } catch (e) { setError(errMsg(e)); }
    finally { setIsSaving(false); }
  }

  async function toggle(item: ConditionalItem) {
    try {
      await apiClient.request<ConditionalItem>(`/admin/conditional/${item.id}`, {
        method: "PATCH",
        body: { isEnabled: !item.isEnabled },
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, isEnabled: !i.isEnabled } : i));
    } catch (e) { setError(errMsg(e)); }
  }

  async function remove(id: string) {
    if (!confirm("이 조건을 삭제하시겠습니까?")) return;
    try {
      await apiClient.request(`/admin/conditional/${id}`, { method: "DELETE" });
      setItems(prev => prev.filter(i => i.id !== id));
      setToast("삭제되었습니다.");
    } catch (e) { setError(errMsg(e)); }
  }

  function addKeyword() {
    const kw = form.keywordInput.trim();
    if (!kw || form.triggerKeywords.includes(kw)) return;
    setForm(p => ({ ...p, triggerKeywords: [...p.triggerKeywords, kw], keywordInput: "" }));
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 9999, padding: "12px 20px", borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {toast}
        </div>
      )}

      <div className="mb-2">
        <h1 className="section-title">조건별 답변 설정</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>특정 키워드가 감지되면 링크·동영상·파일·연락처를 답변과 함께 제공합니다.</p>
      </div>

      {/* 필터 + 추가 버튼 */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} className="input-field" style={{ width: 200 }}>
          {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" onClick={() => { setError(null); setForm(DEFAULT_FORM); setIsModalOpen(true); }} className="btn-primary" style={{ marginLeft: "auto", padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus style={{ width: 14, height: 14 }} />조건 추가
        </button>
      </div>
      {error && <p style={{ fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</p>}

      {/* 목록 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>등록된 조건이 없습니다. 조건을 추가해보세요.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="table-header">조건명</th>
                <th className="table-header">트리거 키워드</th>
                <th className="table-header" style={{ width: 90 }}>범위</th>
                <th className="table-header" style={{ width: 100 }}>액션 타입</th>
                <th className="table-header">라벨 / 값</th>
                <th className="table-header" style={{ width: 70 }}>활성</th>
                <th className="table-header" style={{ width: 60 }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", opacity: item.isEnabled ? 1 : 0.5 }}>
                  <td className="table-cell" style={{ fontWeight: 500, color: "#1e293b" }}>{item.name}</td>
                  <td className="table-cell">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {item.triggerKeywords.map(k => (
                        <span key={k} style={{ fontSize: 11, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 6px", color: "#475569" }}>{k}</span>
                      ))}
                    </div>
                  </td>
                  <td className="table-cell"><span className="badge-neutral">{TRIGGER_LABELS[item.triggerType as TriggerType]}</span></td>
                  <td className="table-cell">
                    <span style={{ fontSize: 13 }}>{ACTION_ICONS[item.actionType as ActionType]} {ACTION_LABELS[item.actionType as ActionType]}</span>
                  </td>
                  <td className="table-cell">
                    <div style={{ fontWeight: 500, color: "#1e293b" }}>{item.actionLabel}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{item.actionValue}</div>
                  </td>
                  <td className="table-cell" style={{ textAlign: "center" }}>
                    <button type="button" onClick={() => void toggle(item)} style={{ background: "none", border: "none", cursor: "pointer", color: item.isEnabled ? "#2563eb" : "#94a3b8" }}>
                      {item.isEnabled ? <ToggleRight style={{ width: 22, height: 22 }} /> : <ToggleLeft style={{ width: 22, height: 22 }} />}
                    </button>
                  </td>
                  <td className="table-cell" style={{ textAlign: "center" }}>
                    <button type="button" onClick={() => void remove(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}>
                      <Trash2 style={{ width: 15, height: 15 }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 추가 모달 */}
      <AdminModal open={isModalOpen} title="조건별 답변 추가" onClose={() => { if (!isSaving) { setIsModalOpen(false); setError(null); } }}>
        <div className="space-y-4">
          {error && <p style={{ fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>{error}</p>}

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">조건명 *</span>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="예: 신청 방법 관련 링크" className="input-field" />
          </label>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">트리거 키워드 *</span>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={form.keywordInput} onChange={e => setForm(p => ({ ...p, keywordInput: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                placeholder="키워드 입력 후 Enter" className="input-field" style={{ flex: 1 }} />
              <button type="button" onClick={addKeyword} className="btn-secondary" style={{ padding: "8px 14px" }}>추가</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {form.triggerKeywords.map(k => (
                <span key={k} style={{ fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {k}
                  <button type="button" onClick={() => setForm(p => ({ ...p, triggerKeywords: p.triggerKeywords.filter(x => x !== k) }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#64748b" }}>✕</button>
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">트리거 범위</span>
              <select value={form.triggerType} onChange={e => setForm(p => ({ ...p, triggerType: e.target.value as TriggerType }))} className="input-field">
                <option value="both">질문 + 답변</option>
                <option value="question">질문만</option>
                <option value="answer">답변만</option>
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">액션 타입</span>
              <select value={form.actionType} onChange={e => setForm(p => ({ ...p, actionType: e.target.value as ActionType }))} className="input-field">
                <option value="link">🔗 링크</option>
                <option value="video">🎬 동영상</option>
                <option value="file">📎 파일</option>
                <option value="contact">📞 연락처</option>
              </select>
            </label>
          </div>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">버튼 라벨 *</span>
            <input value={form.actionLabel} onChange={e => setForm(p => ({ ...p, actionLabel: e.target.value }))} placeholder="예: 신청하기" className="input-field" />
          </label>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">
              {form.actionType === "contact" ? "전화번호 / 이메일" : form.actionType === "file" ? "파일 URL" : "URL"} *
            </span>
            <input value={form.actionValue} onChange={e => setForm(p => ({ ...p, actionValue: e.target.value }))}
              placeholder={form.actionType === "contact" ? "예: 02-0000-0000" : "https://..."}
              className="input-field" />
          </label>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">설명 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
            <input value={form.actionDescription} onChange={e => setForm(p => ({ ...p, actionDescription: e.target.value }))} placeholder="버튼 hover 시 표시되는 설명" className="input-field" />
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={() => { setIsModalOpen(false); setError(null); }} className="btn-secondary" style={{ padding: "8px 16px" }}>취소</button>
            <button type="button" onClick={() => void save()} disabled={isSaving} className="btn-primary" style={{ padding: "8px 20px", opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? "추가 중..." : "추가"}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
