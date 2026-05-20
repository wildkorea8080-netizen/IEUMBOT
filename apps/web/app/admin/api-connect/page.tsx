"use client";

import { Fragment, useEffect, useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, FlaskConical, ChevronDown, ChevronUp } from "lucide-react";

import { AdminModal } from "../../../components/ui/admin-modal";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { apiClient } from "../../../lib/api/client";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type ResponseType = "text" | "view" | "list";

type ViewConfig = {
  titlePath: string;
  contentPath: string;
  moreLinkPath: string;
  moreLinkFollow: boolean;
};

type ListConfig = {
  itemsPath: string;
  columnLabels: string;   // 쉼표 구분 입력 → string[]
  contentFields: string;  // 쉼표 구분 입력 → string[]
  sourceLinkPath: string;
  targetLinkFont: "_blank" | "_self";
};

type ApiEndpointItem = {
  id: string; chatbotId: string; name: string; endpointUrl: string; method: string;
  headers: Record<string, string>; params: Record<string, string>;
  intentKeywords: string[];
  responseType: ResponseType;
  responsePath: string | null; responseTemplate: string | null;
  viewConfig: Record<string, unknown> | null;
  listConfig: Record<string, unknown> | null;
  cacheSeconds: number; isEnabled: boolean; createdAt: string;
};
type ListResponse = { items: ApiEndpointItem[]; total: number };
type TestResponse = { success: boolean; resultText: string | null; error: string | null; rawPreview: string | null };

function errMsg(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "오류가 발생했습니다.";
}

const DEFAULT_VIEW: ViewConfig = { titlePath: "", contentPath: "", moreLinkPath: "", moreLinkFollow: false };
const DEFAULT_LIST: ListConfig = { itemsPath: "", columnLabels: "", contentFields: "", sourceLinkPath: "", targetLinkFont: "_blank" };

const DEFAULT_FORM = {
  name: "", endpointUrl: "", method: "GET" as "GET" | "POST",
  headerKey: "", headerVal: "", headers: {} as Record<string, string>,
  paramKey: "", paramVal: "", params: {} as Record<string, string>,
  kwInput: "", intentKeywords: [] as string[],
  responseType: "text" as ResponseType,
  responsePath: "", responseTemplate: "", cacheSeconds: 60, isEnabled: true,
  view: DEFAULT_VIEW,
  list: DEFAULT_LIST,
};

// ── 응답 타입 배지 ─────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: ResponseType }) {
  const map = {
    text: { label: "Text", bg: "#f1f5f9", color: "#475569" },
    view: { label: "View", bg: "#eff6ff", color: "#2563eb" },
    list: { label: "List", bg: "#f0fdf4", color: "#16a34a" },
  };
  const s = map[type] ?? map.text;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, borderRadius: 4, padding: "2px 8px" }}>
      {s.label}
    </span>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  function buildBody() {
    const base = {
      chatbotId, name: form.name.trim(), endpointUrl: form.endpointUrl.trim(),
      method: form.method, headers: form.headers, params: form.params,
      intentKeywords: form.intentKeywords,
      responseType: form.responseType,
      cacheSeconds: form.cacheSeconds, isEnabled: form.isEnabled,
      responsePath: null as string | null, responseTemplate: null as string | null,
      viewConfig: null as Record<string, unknown> | null,
      listConfig: null as Record<string, unknown> | null,
    };
    if (form.responseType === "text") {
      base.responsePath = form.responsePath.trim() || null;
      base.responseTemplate = form.responseTemplate.trim() || null;
    } else if (form.responseType === "view") {
      base.viewConfig = {
        titlePath: form.view.titlePath.trim() || null,
        contentPath: form.view.contentPath.trim() || null,
        moreLinkPath: form.view.moreLinkPath.trim() || null,
        moreLinkFollow: form.view.moreLinkFollow,
      };
    } else {
      base.listConfig = {
        itemsPath: form.list.itemsPath.trim() || null,
        columnLabels: form.list.columnLabels.split(",").map(s => s.trim()).filter(Boolean),
        contentFields: form.list.contentFields.split(",").map(s => s.trim()).filter(Boolean),
        sourceLinkPath: form.list.sourceLinkPath.trim() || null,
        targetLinkFont: form.list.targetLinkFont,
      };
    }
    return base;
  }

  async function save() {
    if (!form.name.trim() || !form.endpointUrl.trim() || !chatbotId) return;
    setIsSaving(true); setError(null);
    try {
      await apiClient.request<ApiEndpointItem>("/admin/api-endpoints", { method: "POST", body: buildBody() });
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

  // ── 응답 타입별 설정 UI ───────────────────────────────────────────────────────
  function ResponseTypeConfig() {
    if (form.responseType === "view") {
      return (
        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", padding: "0 6px" }}>View 설정</legend>
          <div className="space-y-3">
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">제목 경로 (JSONPath)</span>
              <input value={form.view.titlePath} onChange={e => setForm(p => ({ ...p, view: { ...p.view, titlePath: e.target.value } }))} placeholder="$.data.title" className="input-field" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">내용 경로 (JSONPath)</span>
              <input value={form.view.contentPath} onChange={e => setForm(p => ({ ...p, view: { ...p.view, contentPath: e.target.value } }))} placeholder="$.data.summary" className="input-field" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">링크 경로 (JSONPath) <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
              <input value={form.view.moreLinkPath} onChange={e => setForm(p => ({ ...p, view: { ...p.view, moreLinkPath: e.target.value } }))} placeholder="$.data.url" className="input-field" />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151" }}>
              <input type="checkbox" checked={form.view.moreLinkFollow} onChange={e => setForm(p => ({ ...p, view: { ...p.view, moreLinkFollow: e.target.checked } }))} className="h-4 w-4 rounded" />
              링크 클릭 시 대화 계속 진행 (follow)
            </label>
          </div>
        </fieldset>
      );
    }

    if (form.responseType === "list") {
      return (
        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: "#16a34a", padding: "0 6px" }}>List 설정</legend>
          <div className="space-y-3">
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">목록 경로 (JSONPath)</span>
              <input value={form.list.itemsPath} onChange={e => setForm(p => ({ ...p, list: { ...p.list, itemsPath: e.target.value } }))} placeholder="$.data.items" className="input-field" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">컬럼 레이블 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(쉼표 구분)</span></span>
              <input value={form.list.columnLabels} onChange={e => setForm(p => ({ ...p, list: { ...p.list, columnLabels: e.target.value } }))} placeholder="제목, 날짜, 부서" className="input-field" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">데이터 필드 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(쉼표 구분, 레이블 순서와 일치)</span></span>
              <input value={form.list.contentFields} onChange={e => setForm(p => ({ ...p, list: { ...p.list, contentFields: e.target.value } }))} placeholder="title, date, department" className="input-field" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">링크 필드명 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
              <input value={form.list.sourceLinkPath} onChange={e => setForm(p => ({ ...p, list: { ...p.list, sourceLinkPath: e.target.value } }))} placeholder="url" className="input-field" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">링크 열기 방식</span>
              <select value={form.list.targetLinkFont} onChange={e => setForm(p => ({ ...p, list: { ...p.list, targetLinkFont: e.target.value as "_blank" | "_self" } }))} className="input-field">
                <option value="_blank">새 탭으로 열기</option>
                <option value="_self">현재 창에서 열기</option>
              </select>
            </label>
          </div>
        </fieldset>
      );
    }

    // text 타입
    return (
      <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
        <legend style={{ fontSize: 12, fontWeight: 600, color: "#475569", padding: "0 6px" }}>Text 설정</legend>
        <div className="space-y-3">
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">응답 경로 (JSONPath) <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
            <input value={form.responsePath} onChange={e => setForm(p => ({ ...p, responsePath: e.target.value }))} placeholder="$.data.items" className="input-field" />
          </label>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">응답 템플릿 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택, {"{data}"} {"{items}"})</span></span>
            <textarea value={form.responseTemplate} onChange={e => setForm(p => ({ ...p, responseTemplate: e.target.value }))} rows={2} placeholder="현재 채용 중인 공고: {items}" className="input-field" />
          </label>
        </div>
      </fieldset>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 9999, padding: "12px 20px", borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: 14, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
          {toast}
        </div>
      )}

      <div className="mb-2">
        <h1 className="section-title">API 연동</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>외부 API와 연결해 채용공고·공지사항·이벤트 등 실시간 데이터를 AI 답변에 반영합니다.</p>
      </div>

      {/* 응답 타입 안내 */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>응답 타입 안내</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { type: "text", desc: "JSONPath로 데이터 추출 → 텍스트 템플릿으로 AI에 전달" },
            { type: "view", desc: "제목·내용·링크 추출 → 카드 형태로 표시 (위젯 렌더링 예정)" },
            { type: "list", desc: "항목 목록 추출 → 컬럼 설정으로 표 형태 표시 (위젯 렌더링 예정)" },
          ].map(({ type, desc }) => (
            <div key={type} style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: "1 1 200px" }}>
              <TypeBadge type={type as ResponseType} />
              <span style={{ fontSize: 12, color: "#64748b" }}>{desc}</span>
            </div>
          ))}
        </div>
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
                <th className="table-header">타입</th>
                <th className="table-header">엔드포인트</th>
                <th className="table-header">트리거 키워드</th>
                <th className="table-header" style={{ width: 70 }}>활성</th>
                <th className="table-header" style={{ width: 100 }}>테스트</th>
                <th className="table-header" style={{ width: 60 }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <Fragment key={item.id}>
                  <tr style={{ borderBottom: expandedId === item.id ? "none" : "1px solid #f1f5f9", opacity: item.isEnabled ? 1 : 0.5 }}>
                    <td className="table-cell">
                      <button type="button" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 500, color: "#1e293b", padding: 0 }}>
                        {expandedId === item.id ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
                        {item.name}
                      </button>
                    </td>
                    <td className="table-cell"><TypeBadge type={item.responseType} /></td>
                    <td className="table-cell">
                      <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                        <span style={{ background: "#f1f5f9", borderRadius: 4, padding: "1px 5px", marginRight: 4, fontWeight: 600 }}>{item.method}</span>
                        {item.endpointUrl}
                      </div>
                    </td>
                    <td className="table-cell">
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {item.intentKeywords.slice(0, 4).map(k => (
                          <span key={k} style={{ fontSize: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "1px 6px", color: "#1d4ed8" }}>{k}</span>
                        ))}
                      </div>
                    </td>
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
                  {expandedId === item.id && (
                    <tr key={`${item.id}-detail`}>
                      <td colSpan={7} style={{ padding: "0 16px 12px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ fontSize: 12, color: "#475569", display: "flex", flexWrap: "wrap", gap: 16, paddingTop: 8 }}>
                          {item.responseType === "view" && item.viewConfig && (
                            <>
                              <span><strong>제목 경로:</strong> {String(item.viewConfig.titlePath ?? "-")}</span>
                              <span><strong>내용 경로:</strong> {String(item.viewConfig.contentPath ?? "-")}</span>
                              <span><strong>링크 경로:</strong> {String(item.viewConfig.moreLinkPath ?? "-")}</span>
                              <span><strong>Follow:</strong> {item.viewConfig.moreLinkFollow ? "예" : "아니오"}</span>
                            </>
                          )}
                          {item.responseType === "list" && item.listConfig && (
                            <>
                              <span><strong>목록 경로:</strong> {String(item.listConfig.itemsPath ?? "-")}</span>
                              <span><strong>컬럼:</strong> {Array.isArray(item.listConfig.columnLabels) ? (item.listConfig.columnLabels as string[]).join(", ") : "-"}</span>
                              <span><strong>필드:</strong> {Array.isArray(item.listConfig.contentFields) ? (item.listConfig.contentFields as string[]).join(", ") : "-"}</span>
                              <span><strong>링크 필드:</strong> {String(item.listConfig.sourceLinkPath ?? "-")}</span>
                            </>
                          )}
                          {item.responseType === "text" && (
                            <>
                              {item.responsePath && <span><strong>응답 경로:</strong> {item.responsePath}</span>}
                              {item.responseTemplate && <span><strong>템플릿:</strong> {item.responseTemplate}</span>}
                            </>
                          )}
                          <span><strong>캐시:</strong> {item.cacheSeconds}초</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
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

      {/* 추가 모달 */}
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

          {/* 응답 타입 선택 */}
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">응답 타입 *</span>
            <div style={{ display: "flex", gap: 8 }}>
              {(["text", "view", "list"] as const).map(t => (
                <button key={t} type="button" onClick={() => setForm(p => ({ ...p, responseType: t }))}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    border: form.responseType === t ? "2px solid #2563eb" : "1px solid #e2e8f0",
                    background: form.responseType === t ? "#eff6ff" : "#fff",
                    color: form.responseType === t ? "#2563eb" : "#64748b",
                  }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              {form.responseType === "text" && "JSONPath로 데이터를 추출해 템플릿으로 AI에 전달합니다."}
              {form.responseType === "view" && "제목·내용·링크를 추출해 카드 형태로 표시합니다."}
              {form.responseType === "list" && "항목 목록을 추출해 컬럼 설정으로 표시합니다."}
            </p>
          </div>

          {/* 응답 타입별 설정 */}
          {ResponseTypeConfig()}

          {/* 트리거 키워드 */}
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

          {/* 인증 헤더 */}
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">인증 헤더 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(선택)</span></span>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={form.headerKey} onChange={e => setForm(p => ({ ...p, headerKey: e.target.value }))} placeholder="Authorization" className="input-field" style={{ flex: 1 }} />
              <input value={form.headerVal} onChange={e => setForm(p => ({ ...p, headerVal: e.target.value }))} placeholder="Bearer token..." className="input-field" style={{ flex: 2 }} />
              <button type="button" onClick={addHeader} className="btn-secondary" style={{ padding: "8px 10px" }}>추가</button>
            </div>
            {Object.entries(form.headers).map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, color: "#475569", marginBottom: 3 }}>
                <code>{k}: {v.slice(0, 30)}{v.length > 30 ? "..." : ""}</code>
              </div>
            ))}
          </div>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">캐시 시간 (초)</span>
            <input type="number" min={0} value={form.cacheSeconds} onChange={e => setForm(p => ({ ...p, cacheSeconds: Number(e.target.value) }))} className="input-field" style={{ width: 120 }} />
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
