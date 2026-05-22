"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X, Loader2 } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { apiClient } from "../../../lib/api/client";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type ApiEndpointItem = {
  id: string;
  chatbotId: string;
  name: string;
  endpointUrl: string;
  method: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  intentKeywords: string[];
  responseType: string;
  responseTemplate: string | null;
  isEnabled: boolean;
  createdAt: string;
};

type ListResponse = { items: ApiEndpointItem[]; total: number };

type ActiveTab = "header" | "param" | "ai" | null;

const DEFAULT_FORM = {
  name: "",
  triggerQuestion: "",
  endpointUrl: "",
  method: "GET" as "GET" | "POST",
  headerKey: "", headerVal: "",
  headers: {} as Record<string, string>,
  paramKey: "", paramVal: "",
  params: {} as Record<string, string>,
  aiGuidance: "",
};

function errMsg(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "오류가 발생했습니다.";
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("ko-KR"); } catch { return iso; }
}

// ── 모달 ──────────────────────────────────────────────────────────────────────

function AddModal({ open, onClose, chatbotId, onSaved }: {
  open: boolean; onClose: () => void; chatbotId: string; onSaved: () => void;
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setForm(DEFAULT_FORM); setActiveTab(null); setError(null); } }, [open]);

  const addHeader = () => {
    if (!form.headerKey.trim()) return;
    setForm(p => ({ ...p, headers: { ...p.headers, [p.headerKey.trim()]: p.headerVal }, headerKey: "", headerVal: "" }));
  };
  const addParam = () => {
    if (!form.paramKey.trim()) return;
    setForm(p => ({ ...p, params: { ...p.params, [p.paramKey.trim()]: p.paramVal }, paramKey: "", paramVal: "" }));
  };

  async function save() {
    if (!form.name.trim() || !form.triggerQuestion.trim() || !form.endpointUrl.trim()) {
      setError("API 이름, 트리거 질문, 엔드포인트는 필수입니다."); return;
    }
    setIsSaving(true); setError(null);
    try {
      await apiClient.request<ApiEndpointItem>("/admin/api-endpoints", {
        method: "POST",
        body: {
          chatbotId,
          name: form.name.trim(),
          endpointUrl: form.endpointUrl.trim(),
          method: form.method,
          headers: form.headers,
          params: form.params,
          intentKeywords: [form.triggerQuestion.trim()],
          responseType: "text",
          responseTemplate: form.aiGuidance.trim() || null,
          cacheSeconds: 60,
          isEnabled: true,
        },
      });
      onSaved(); onClose();
    } catch (e) { setError(errMsg(e)); }
    finally { setIsSaving(false); }
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,.18)", maxHeight: "90vh", overflowY: "auto" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>새 연동 규칙 추가</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 20, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* API 이름 */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>API 이름</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="예 : 게시판 조회 API"
              style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}
            />
          </div>

          {/* 트리거 질문 */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>트리거 질문</label>
            <input
              value={form.triggerQuestion}
              onChange={e => setForm(p => ({ ...p, triggerQuestion: e.target.value }))}
              placeholder="예 : 최근소식, 공지사항에 대해 물어볼 때"
              style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}
            />
          </div>

          {/* API 엔드포인트 */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>API 엔드포인트</label>
            <input
              value={form.endpointUrl}
              onChange={e => setForm(p => ({ ...p, endpointUrl: e.target.value }))}
              placeholder="예 : https://your-api.com/api/notice"
              style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", background: "#fff", outline: "none" }}
            />
          </div>

          {/* 호출방식 */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>호출방식</label>
            <div style={{ position: "relative" }}>
              <select
                value={form.method}
                onChange={e => setForm(p => ({ ...p, method: e.target.value as "GET" | "POST" }))}
                style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", background: "#fff", outline: "none", appearance: "none" }}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
              <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9ca3af" }}>▾</div>
            </div>
          </div>

          {/* 탭 토글 */}
          <div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["header", "param", "ai"] as const).map(tab => {
                const labels = { header: "헤더", param: "파라미터", ai: "AI지침" };
                const isActive = activeTab === tab;
                return (
                  <button key={tab} type="button"
                    onClick={() => setActiveTab(isActive ? null : tab)}
                    style={{
                      padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: isActive ? 600 : 400,
                      border: `1.5px solid ${isActive ? "#111827" : "#e5e7eb"}`,
                      background: isActive ? "#111827" : "#fff",
                      color: isActive ? "#fff" : "#374151", cursor: "pointer",
                    }}>
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* 헤더 입력 */}
            {activeTab === "header" && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input value={form.headerKey} onChange={e => setForm(p => ({ ...p, headerKey: e.target.value }))}
                    placeholder="키 (예: Authorization)"
                    style={{ flex: 1, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none" }} />
                  <input value={form.headerVal} onChange={e => setForm(p => ({ ...p, headerVal: e.target.value }))}
                    placeholder="값 (예: Bearer token)"
                    style={{ flex: 2, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none" }} />
                  <button type="button" onClick={addHeader}
                    style={{ padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", fontSize: 13, cursor: "pointer" }}>추가</button>
                </div>
                {Object.entries(form.headers).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12, color: "#475569", padding: "4px 8px", background: "#f1f5f9", borderRadius: 6, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                    <code>{k}: {v.slice(0, 40)}{v.length > 40 ? "..." : ""}</code>
                    <button type="button" onClick={() => { const h = { ...form.headers }; delete h[k]; setForm(p => ({ ...p, headers: h })); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* 파라미터 입력 */}
            {activeTab === "param" && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input value={form.paramKey} onChange={e => setForm(p => ({ ...p, paramKey: e.target.value }))}
                    placeholder="키"
                    style={{ flex: 1, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none" }} />
                  <input value={form.paramVal} onChange={e => setForm(p => ({ ...p, paramVal: e.target.value }))}
                    placeholder="값"
                    style={{ flex: 2, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none" }} />
                  <button type="button" onClick={addParam}
                    style={{ padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", fontSize: 13, cursor: "pointer" }}>추가</button>
                </div>
                {Object.entries(form.params).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12, color: "#475569", padding: "4px 8px", background: "#f1f5f9", borderRadius: 6, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                    <code>{k}: {v}</code>
                    <button type="button" onClick={() => { const pp = { ...form.params }; delete pp[k]; setForm(p => ({ ...p, params: pp })); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* AI 지침 */}
            {activeTab === "ai" && (
              <div style={{ marginTop: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>AI 답변 지침</label>
                <textarea
                  value={form.aiGuidance}
                  onChange={e => setForm(p => ({ ...p, aiGuidance: e.target.value }))}
                  placeholder="제공된 내용을 표로 출력 해주세요. 링크를 꼭 추가해주세요."
                  rows={4}
                  style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.7 }}
                />
              </div>
            )}
          </div>
        </div>

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: "12px 0", border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", fontSize: 14, fontWeight: 500, color: "#374151", cursor: "pointer" }}>
            취소
          </button>
          <button type="button" onClick={() => void save()} disabled={isSaving || !form.name.trim() || !form.endpointUrl.trim() || !form.triggerQuestion.trim()}
            style={{
              flex: 1, padding: "12px 0", border: "none", borderRadius: 10,
              background: (isSaving || !form.name.trim() || !form.endpointUrl.trim() || !form.triggerQuestion.trim()) ? "#9ca3af" : "#111827",
              fontSize: 14, fontWeight: 600, color: "#fff",
              cursor: (isSaving || !form.name.trim() || !form.endpointUrl.trim() || !form.triggerQuestion.trim()) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            {isSaving ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />저장 중...</> : "규칙 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

export default function ApiConnectPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<ApiEndpointItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await getAdminChatbots();
        setChatbots(r.items);
        if (r.items[0]) setChatbotId(r.items[0].id);
      } catch (e) { setError(errMsg(e)); }
    })();
  }, []);

  useEffect(() => { if (chatbotId) void load(); }, [chatbotId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    setIsLoading(true);
    try {
      const res = await apiClient.request<ListResponse>(`/admin/api-endpoints?chatbotId=${chatbotId}`);
      setItems(res.items);
    } catch (e) { setError(errMsg(e)); }
    finally { setIsLoading(false); }
  }

  async function remove(id: string) {
    if (!confirm("이 API 연동 규칙을 삭제하시겠습니까?")) return;
    try {
      await apiClient.request(`/admin/api-endpoints/${id}`, { method: "DELETE" });
      setItems(prev => prev.filter(i => i.id !== id));
      setToast("삭제되었습니다.");
    } catch (e) { setError(errMsg(e)); }
  }

  const triggerLabel = (item: ApiEndpointItem) =>
    item.intentKeywords[0] ?? "-";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 토스트 */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 9999, padding: "12px 20px", borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {toast}
        </div>
      )}

      {/* 챗봇 선택 (복수인 경우) */}
      {chatbots.length > 1 && (
        <div>
          <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} className="input-field" style={{ width: 220 }}>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {error && (
        <p style={{ fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</p>
      )}

      {/* API 연결 카드 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        {/* 카드 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px 16px" }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>API 연결</h2>
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              플래니가 웹 콘텐츠에 접근할 수 있도록 시스템 API를 연동하는 설정으로, 사용자 웹 환경에서도 설정이 필요합니다
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setError(null); setIsModalOpen(true); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 8,
              background: "#fff", fontSize: 13, fontWeight: 500, color: "#374151",
              cursor: "pointer", flexShrink: 0, marginLeft: 20, whiteSpace: "nowrap",
            }}>
            <Plus style={{ width: 14, height: 14 }} />새 API 추가
          </button>
        </div>

        {/* 테이블 */}
        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
            등록된 API 연동 규칙이 없습니다.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #e5e7eb" }}>
                {["API 이름", "트리거 질문", "API endpoint", "생성일", "관리"].map(col => (
                  <th key={col} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280", background: "#f9fafb" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 500, color: "#111827" }}>{item.name}</td>
                  <td style={{ padding: "14px 16px", color: "#6b7280", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerLabel(item)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#475569", borderRadius: 4, padding: "1px 6px" }}>{item.method}</span>
                      <span style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{item.endpointUrl}</span>
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#9ca3af", fontSize: 12 }}>{formatDate(item.createdAt)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <button type="button" onClick={() => void remove(item.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 4 }}>
                      <Trash2 style={{ width: 15, height: 15 }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 푸터 */}
        <div style={{ padding: "10px 24px", borderTop: "1px solid #f1f5f9", fontSize: 13, color: "#9ca3af" }}>
          총 {items.length}건
        </div>
      </div>

      {/* 응답 형식 카드 */}
      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>응답 형식</h2>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            content의 내용이 AI의 컨텍스트로 활용됩니다. 5000자 이내로 값이 담기도록 해주세요.
          </p>
        </div>
        <div style={{ margin: "0 24px 24px", borderRadius: 12, background: "#1e1e2e", padding: "20px 24px", fontFamily: "monospace", fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ color: "#6b7280" }}>{`<!-- Content-Type: text/plain; charset=utf-8 →`}</div>
          <div style={{ color: "#e2e8f0" }}>{`{`}</div>
          <div style={{ color: "#e2e8f0", paddingLeft: 20 }}>
            <span style={{ color: "#93c5fd" }}>{`"content"`}</span>
            <span style={{ color: "#e2e8f0" }}>{`: `}</span>
            <span style={{ color: "#86efac" }}>{`"your api response content"`}</span>
          </div>
          <div style={{ color: "#e2e8f0" }}>{`}`}</div>
        </div>
      </div>

      {/* 추가 모달 */}
      <AddModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        chatbotId={chatbotId}
        onSaved={() => { setToast("API 연동이 추가되었습니다."); void load(); }}
      />
    </div>
  );
}
