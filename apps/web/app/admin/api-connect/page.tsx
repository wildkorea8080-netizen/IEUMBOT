"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, FlaskConical } from "lucide-react";

import { AdminModal } from "../../../components/ui/admin-modal";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { apiClient } from "../../../lib/api/client";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

type ApiEndpointItem = {
  id: string; chatbotId: string; name: string; endpointUrl: string; method: string;
  headers: Record<string, string>; params: Record<string, string>;
  intentKeywords: string[]; responsePath: string | null; responseTemplate: string | null;
  cacheSeconds: number; isEnabled: boolean; createdAt: string;
};
type ListResponse = { items: ApiEndpointItem[]; total: number };
type TestResponse = { success: boolean; resultText: string | null; error: string | null; rawPreview: string | null };

function errMsg(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "오류가 발생했습니다.";
}

const DEFAULT_FORM = {
  name: "", endpointUrl: "", method: "GET" as "GET" | "POST",
  headerKey: "", headerVal: "", headers: {} as Record<string, string>,
  paramKey: "", paramVal: "", params: {} as Record<string, string>,
  kwInput: "", intentKeywords: [] as string[],
  responsePath: "", responseTemplate: "", cacheSeconds: 60, isEnabled: true,
};

export default function ApiConnectPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<ApiEndpointItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => { void (async () => {
    try { const r = await getAdminChatbots(); setChatbots(r.items); if (r.items[0]) setChatbotId(r.items[0].id); }
    catch (e) { setError(errMsg(e)); }
  })(); }, []);

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
    } catch (e) { setError(errMsg(e)); } finally { setIsLoading(false); }
  }

  async function save() {
    if (!form.name.trim() || !form.endpointUrl.trim() || !chatbotId) return;
    setIsSaving(true); setError(null);
    try {
      await apiClient.request<ApiEndpointItem>("/admin/api-endpoints", {
        method: "POST",
        body: {
          chatbotId, name: form.name.trim(), endpointUrl: form.endpointUrl.trim(),
          method: form.method, headers: form.headers, params: form.params,
          intentKeywords: form.intentKeywords,
          responsePath: form.responsePath.trim() || null,
          responseTemplate: form.responseTemplate.trim() || null,
          cacheSeconds: form.cacheSeconds, isEnabled: form.isEnabled,
        },
      });
      setIsModalOpen(false); setForm(DEFAULT_FORM);
      setToast("API 연동이 추가되었습니다."); await load();
    } catch (e) { setError(errMsg(e)); } finally { setIsSaving(false); }
  }

  async function toggle(item: ApiEndpointItem) {
    try {
      await apiClient.request(`/admin/api-endpoints/${item.id}`, { method: "PATCH", body: { isEnabled: !item.isEnabled } });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, isEnabled: !i.isEnabled } : i));
    } catch (e) { setError(errMsg(e)); }
  }

  async function remove(id: string) {
    if (!confirm("이 API 연동을 삭제하시겠습니까?")) return;
    try {
      await apiClient.request(`/admin/api-endpoints/${id}`, { method: "DELETE" });
      setItems(prev => prev.filter(i => i.id !== id)); setToast("삭제되었습니다.");
    } catch (e) { setError(errMsg(e)); }
  }

  async function testEndpoint(id: string) {
    setTestingId(id); setTestResult(null);
    try {
      const res = await apiClient.request<TestResponse>(`/admin/api-endpoints/${id}/test`, { method: "POST" });
      setTestResult(res);
    } catch (e) { setTestResult({ success: false, resultText: null, error: errMsg(e), rawPreview: null }); }
    finally { setTestingId(null); }
  }

  const addKw = () => {
    const kw = form.kwInput.trim();
    if (!kw || form.intentKeywords.includes(kw)) return;
    setForm(p => ({ ...p, intentKeywords: [...p.intentKeywords, kw], kwInput: "" }));
  };
  const addHeader = () => {
    if (!form.headerKey.trim()) return;
    setForm(p => ({ ...p, headers: { ...p.headers, [p.headerKey.trim()]: p.headerVal }, headerKey: "", headerVal: "" }));
  };

  return (
    <div className="space-y-4">
      {toast && <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 9999, padding: "12px 20px", borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>{toast}</div>}

      <div className="mb-2">
        <h1 className="section-title">API 연동</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>외부 API와 연결해 채용공고·공지사항·이벤트 등 실시간 데이터를 AI 답변에 반영합니다.</p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-4" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} className="input-field" style={{ width: 200 }}>
          {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" onClick={() => { setError(null); setForm(DEFAULT_FORM); setTestResult(null); setIsModalOpen(true); }} className="btn-primary" style={{ marginLeft: "auto", padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus style={{ width: 14, height: 14 }} />API 연동 추가
        </button>
      </div>
      {error && <p style={{ fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</p>}

      <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>등록된 API 연동이 없습니다.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="table-header">연동명</th>
                <th className="table-header">엔드포인트</th>
                <th className="table-header">트리거 키워드</th>
                <th className="table-header" style={{ width: 90 }}>캐시(초)</th>
                <th className="table-header" style={{ width: 70 }}>활성</th>
                <th className="table-header" style={{ width: 100 }}>테스트</th>
                <th className="table-header" style={{ width: 60 }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", opacity: item.isEnabled ? 1 : 0.5 }}>
                  <td className="table-cell" style={{ fontWeight: 500, color: "#1e293b" }}>{item.name}</td>
                  <td className="table-cell">
                    <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                      <span style={{ background: "#f1f5f9", borderRadius: 4, padding: "1px 5px", marginRight: 4, fontWeight: 600 }}>{item.method}</span>
                      {item.endpointUrl}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {item.intentKeywords.slice(0, 5).map(k => (
                        <span key={k} style={{ fontSize: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "1px 6px", color: "#1d4ed8" }}>{k}</span>
                      ))}
                    </div>
                  </td>
                  <td className="table-cell" style={{ color: "#64748b", textAlign: "center" }}>{item.cacheSeconds}</td>
                  <td className="table-cell" style={{ textAlign: "center" }}>
                    <button type="button" onClick={() => void toggle(item)} style={{ background: "none", border: "none", cursor: "pointer", color: item.isEnabled ? "#2563eb" : "#94a3b8" }}>
                      {item.isEnabled ? <ToggleRight style={{ width: 22, height: 22 }} /> : <ToggleLeft style={{ width: 22, height: 22 }} />}
                    </button>
                  </td>
                  <td className="table-cell" style={{ textAlign: "center" }}>
                    <button type="button" onClick={() => void testEndpoint(item.id)} disabled={testingId === item.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", cursor: "pointer", opacity: testingId === item.id ? 0.5 : 1 }}>
                      <FlaskConical style={{ width: 11, height: 11 }} />{testingId === item.id ? "..." : "테스트"}
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
        {testResult && (
          <div style={{ margin: "0 16px 16px", padding: 12, borderRadius: 8, border: `1px solid ${testResult.success ? "#bbf7d0" : "#fecaca"}`, background: testResult.success ? "#f0fdf4" : "#fef2f2" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: testResult.success ? "#16a34a" : "#dc2626", marginBottom: 4 }}>
              {testResult.success ? "✅ 테스트 성공" : "❌ 테스트 실패"}
            </p>
            {testResult.resultText && <p style={{ fontSize: 12, color: "#334155", whiteSpace: "pre-wrap" }}>{testResult.resultText}</p>}
            {testResult.error && <p style={{ fontSize: 12, color: "#dc2626" }}>{testResult.error}</p>}
          </div>
        )}
      </div>

      <AdminModal open={isModalOpen} title="API 연동 추가" onClose={() => { if (!isSaving) { setIsModalOpen(false); setError(null); } }}>
        <div className="space-y-4">
          {error && <p style={{ fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>{error}</p>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">API URL *</span>
              <input value={form.endpointUrl} onChange={e => setForm(p => ({ ...p, endpointUrl: e.target.value }))} placeholder="https://api.example.com/data" className="input-field" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">메서드</span>
              <select value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value as "GET" | "POST" }))} className="input-field">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </label>
          </div>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">연동 이름 *</span>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="예: 채용공고 API" className="input-field" />
          </label>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">트리거 키워드 *</span>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={form.kwInput} onChange={e => setForm(p => ({ ...p, kwInput: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKw(); } }}
                placeholder="키워드 입력 후 Enter" className="input-field" style={{ flex: 1 }} />
              <button type="button" onClick={addKw} className="btn-secondary" style={{ padding: "8px 14px" }}>추가</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {form.intentKeywords.map(k => (
                <span key={k} style={{ fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {k}<button type="button" onClick={() => setForm(p => ({ ...p, intentKeywords: p.intentKeywords.filter(x => x !== k) }))} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>✕</button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">인증 헤더 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={form.headerKey} onChange={e => setForm(p => ({ ...p, headerKey: e.target.value }))} placeholder="예: Authorization" className="input-field" style={{ flex: 1 }} />
              <input value={form.headerVal} onChange={e => setForm(p => ({ ...p, headerVal: e.target.value }))} placeholder="Bearer token..." className="input-field" style={{ flex: 2 }} />
              <button type="button" onClick={addHeader} className="btn-secondary" style={{ padding: "8px 10px" }}>추가</button>
            </div>
            {Object.entries(form.headers).map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, color: "#475569", marginBottom: 3 }}>
                <code>{k}: {v.slice(0, 30)}...</code>
              </div>
            ))}
          </div>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">응답 경로 (JSONPath) <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
            <input value={form.responsePath} onChange={e => setForm(p => ({ ...p, responsePath: e.target.value }))} placeholder="$.data.items" className="input-field" />
          </label>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">응답 템플릿 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
            <textarea value={form.responseTemplate} onChange={e => setForm(p => ({ ...p, responseTemplate: e.target.value }))}
              rows={2} placeholder="현재 채용 중인 공고: {items}" className="input-field" />
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
