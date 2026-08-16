"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X, Loader2 } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import { apiClient } from "../../../lib/api/client";
import { useSelectedChatbot } from "../../../lib/admin-ui/use-selected-chatbot";

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
  listConfig: ListConfig | null;
  isEnabled: boolean;
  createdAt: string;
};

/** 목록형 응답 매핑. 백엔드 _build_list_response 가 읽는 키와 이름을 맞춘다. */
type ListConfig = {
  itemsPath?: string;
  contentFields?: string[];
  columnLabels?: string[];
  sourceLinkPath?: string;
};

type ListResponse = { items: ApiEndpointItem[]; total: number };

type ApiTestResult = {
  success: boolean;
  resultText: string | null;
  error: string | null;
  rawPreview: string | null;
};

type InspectResult = {
  success: boolean;
  error: string | null;
  itemsPath: string | null;
  itemCount: number;
  fields: { name: string; sample: string }[];
  suggestedTitle: string | null;
  suggestedLink: string | null;
};

type ActiveTab = "header" | "param" | "ai" | "list" | null;

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
  // 목록형 — 비워 두면 기존처럼 텍스트로 동작한다.
  responseType: "text" as "text" | "list",
  itemsPath: "",
  contentFields: "",
  columnLabels: "",
  sourceLinkPath: "",
};

/** "a, b, c" → ["a","b","c"]. 빈 항목은 버린다. */
function splitCsv(value: string): string[] {
  return value.split(",").map(v => v.trim()).filter(Boolean);
}

function errMsg(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "오류가 발생했습니다.";
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("ko-KR"); } catch { return iso; }
}

// ── 모달 ──────────────────────────────────────────────────────────────────────

function AddModal({ open, onClose, chatbotId, editItem, onSaved }: {
  open: boolean; onClose: () => void; chatbotId: string; editItem: ApiEndpointItem | null; onSaved: () => void;
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspected, setInspected] = useState<InspectResult | null>(null);

  /** 실제 응답을 분석해 목록형 칸을 대신 채운다. JSON 경로를 손으로 쓰지 않게 하는 게 목적. */
  async function autoFill() {
    if (!editItem) return;
    setIsInspecting(true); setError(null);
    try {
      const r = await apiClient.request<InspectResult>(
        `/admin/api-endpoints/${editItem.id}/inspect`, { method: "POST" },
      );
      setInspected(r);
      if (!r.success) { setError(r.error ?? "응답을 분석하지 못했습니다."); return; }

      // 제목을 맨 앞에 두고, 값이 있는 다른 필드를 최대 2개까지 덧붙인다.
      // 링크 필드는 카드에 따로 붙으므로 표시 필드에서 뺀다.
      const title = r.suggestedTitle ?? r.fields[0]?.name ?? "";
      // 부가 정보는 제목 아래 한 줄에 들어간다. 이용자에게 뜻이 통하는 값만 남긴다.
      //  - 긴 설명문 제외: KOTRA HS코드 품목 설명은 200자가 넘어 제목을 덮는다.
      //  - API 내부 값 제외: dataType(4유형)·hsCdNm(0801,0702) 같은 코드는
      //    짧지만 이용자에게 아무 의미가 없다.
      //  - 날짜·작성자·기관처럼 게시판에서 쓰는 항목을 먼저 고른다.
      const NOISE = /type|code|cd$|cd[A-Z]|id$|seq|gubun|result|totalcnt|pageno/i;
      const USEFUL = /dt$|date|일자|작성|regist|writ|author|dept|org|kotra|nm$/i;
      const usable = r.fields.filter(
        f => f.name !== title && f.name !== r.suggestedLink && f.sample && f.sample.length <= 30,
      );
      const extras = [
        ...usable.filter(f => USEFUL.test(f.name) && !NOISE.test(f.name)),
        ...usable.filter(f => !USEFUL.test(f.name) && !NOISE.test(f.name)),
      ]
        .slice(0, 2)
        .map(f => f.name);
      setForm(p => ({
        ...p,
        responseType: "list",
        itemsPath: r.itemsPath ?? "",
        contentFields: [title, ...extras].filter(Boolean).join(", "),
        columnLabels: "",
        sourceLinkPath: r.suggestedLink ?? "",
      }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setIsInspecting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    if (editItem) {
      setForm({
        ...DEFAULT_FORM,
        name: editItem.name,
        triggerQuestion: editItem.intentKeywords[0] ?? "",
        endpointUrl: editItem.endpointUrl,
        method: editItem.method === "POST" ? "POST" : "GET",
        headers: { ...editItem.headers },
        params: { ...editItem.params },
        aiGuidance: editItem.responseTemplate ?? "",
        responseType: editItem.responseType === "list" ? "list" : "text",
        itemsPath: editItem.listConfig?.itemsPath ?? "",
        contentFields: (editItem.listConfig?.contentFields ?? []).join(", "),
        columnLabels: (editItem.listConfig?.columnLabels ?? []).join(", "),
        sourceLinkPath: editItem.listConfig?.sourceLinkPath ?? "",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setActiveTab(null);
    setError(null);
  }, [open, editItem]);

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
    // 목록형은 어디서 항목을 꺼낼지(itemsPath)와 무엇을 제목으로 쓸지
    // (contentFields 첫 번째)를 알아야 카드를 만들 수 있다.
    const isList = form.responseType === "list";
    const contentFields = splitCsv(form.contentFields);
    if (isList && (!form.itemsPath.trim() || contentFields.length === 0)) {
      setError("목록형은 '항목 경로'와 '표시 필드'가 필요합니다.");
      return;
    }
    setIsSaving(true); setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        endpointUrl: form.endpointUrl.trim(),
        method: form.method,
        headers: form.headers,
        params: form.params,
        intentKeywords: [form.triggerQuestion.trim()],
        responseType: form.responseType,
        responseTemplate: form.aiGuidance.trim() || null,
        // 텍스트로 되돌릴 때 옛 매핑이 남지 않도록 null로 지운다.
        listConfig: isList
          ? {
              itemsPath: form.itemsPath.trim(),
              contentFields,
              columnLabels: splitCsv(form.columnLabels),
              sourceLinkPath: form.sourceLinkPath.trim() || undefined,
            }
          : null,
      };
      if (editItem) {
        await apiClient.request<ApiEndpointItem>(`/admin/api-endpoints/${editItem.id}`, {
          method: "PATCH",
          body: payload,
        });
      } else {
        await apiClient.request<ApiEndpointItem>("/admin/api-endpoints", {
          method: "POST",
          body: { chatbotId, ...payload, cacheSeconds: 60, isEnabled: true },
        });
      }
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
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{editItem ? "연동 규칙 수정" : "새 연동 규칙 추가"}</h2>
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
              {(["header", "param", "ai", "list"] as const).map(tab => {
                const labels = { header: "헤더", param: "파라미터", ai: "AI지침", list: "표시 형식" };
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

            {/* 표시 형식 — 목록형을 고르면 응답 항목을 카드 목록으로 그린다. */}
            {activeTab === "list" && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["text", "list"] as const).map(t => {
                    const on = form.responseType === t;
                    return (
                      <button key={t} type="button"
                        onClick={() => setForm(p => ({ ...p, responseType: t }))}
                        style={{
                          flex: 1, padding: "12px 14px", textAlign: "left", cursor: "pointer",
                          border: `1.5px solid ${on ? "#2563eb" : "#e5e7eb"}`, borderRadius: 10,
                          background: on ? "#eff6ff" : "#fff",
                        }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: on ? "#1d4ed8" : "#374151" }}>
                          {t === "text" ? "텍스트" : "목록형"}
                        </div>
                        <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 3, lineHeight: 1.5 }}>
                          {t === "text"
                            ? "AI가 응답 내용을 읽고 문장으로 답변합니다."
                            : "게시글 목록처럼 제목·항목별 링크가 있는 카드로 보여줍니다."}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {form.responseType === "list" && (
                  <>
                    {editItem ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <button type="button" onClick={() => void autoFill()} disabled={isInspecting}
                          style={{
                            padding: "10px 14px", border: "1.5px solid #2563eb", borderRadius: 8,
                            background: isInspecting ? "#eff6ff" : "#2563eb",
                            color: isInspecting ? "#1d4ed8" : "#fff",
                            fontSize: 13, fontWeight: 600, cursor: isInspecting ? "wait" : "pointer",
                          }}>
                          {isInspecting ? "응답 분석 중…" : "✨ 응답 분석해서 자동으로 채우기"}
                        </button>
                        {inspected?.success && (
                          <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 11.5, color: "#166534", lineHeight: 1.7 }}>
                            항목 <b>{inspected.itemCount}건</b>을 찾았습니다. 사용 가능한 필드:
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                              {inspected.fields.map(f => (
                                <span key={f.name} title={f.sample || "(값 없음)"}
                                  style={{
                                    padding: "2px 7px", borderRadius: 999, fontSize: 11,
                                    background: f.sample ? "#fff" : "#f1f5f9",
                                    border: `1px solid ${f.sample ? "#bbf7d0" : "#e2e8f0"}`,
                                    color: f.sample ? "#166534" : "#94a3b8",
                                  }}>
                                  {f.name}
                                </span>
                              ))}
                            </div>
                            <div style={{ marginTop: 6, color: "#15803d" }}>
                              회색 필드는 값이 비어 있어 카드에 아무것도 표시되지 않습니다.
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 11.5, color: "#92400e", lineHeight: 1.6 }}>
                        먼저 저장한 뒤 <b>수정</b>에서 열면, 실제 응답을 분석해 아래 칸을 자동으로 채워 드립니다.
                      </div>
                    )}
                    {([
                      ["itemsPath", "항목 경로 *", "response.body.itemList.item", "목록이 들어 있는 위치. 점(.)으로 단계를 잇습니다."],
                      ["contentFields", "표시 필드 *", "newsTitl, newsWritDt", "쉼표로 구분. 맨 앞이 카드 제목이 됩니다."],
                      ["columnLabels", "필드 이름표", "제목, 작성일", "표시 필드와 같은 순서. 비우면 필드명이 그대로 나옵니다."],
                      ["sourceLinkPath", "링크 필드", "newsUrl", "각 항목을 눌렀을 때 열 주소가 담긴 필드."],
                    ] as const).map(([key, label, ph, help]) => (
                      <div key={key}>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{label}</label>
                        <input
                          value={form[key]}
                          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                          placeholder={ph}
                          style={{ width: "100%", padding: "10px 12px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none" }}
                        />
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{help}</div>
                      </div>
                    ))}
                  </>
                )}
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
            {isSaving ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />저장 중...</> : (editItem ? "수정 저장" : "규칙 저장")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

export default function ApiConnectPage() {
  // 챗봇은 좌측 상단 '현재 챗봇' 전역 선택을 따른다(메뉴 내 별도 선택기 없음).
  const selected = useSelectedChatbot();
  const chatbotId = selected?.id ?? "";
  const [items, setItems] = useState<ApiEndpointItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<ApiEndpointItem | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ name: string; ok: boolean; msg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (chatbotId) void load(); }, [chatbotId]);

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

  async function testEndpoint(item: ApiEndpointItem) {
    setTestingId(item.id);
    setTestResult(null);
    setError(null);
    try {
      const res = await apiClient.request<ApiTestResult>(`/admin/api-endpoints/${item.id}/test`, { method: "POST" });
      if (res.success) {
        setTestResult({ name: item.name, ok: true, msg: res.rawPreview?.trim() || res.resultText?.trim() || "정상 응답을 받았습니다." });
      } else {
        setTestResult({ name: item.name, ok: false, msg: res.error || "API 호출 실패 또는 빈 응답입니다." });
      }
    } catch (e) {
      setTestResult({ name: item.name, ok: false, msg: errMsg(e) });
    } finally {
      setTestingId(null);
    }
  }

  function openCreate() { setEditItem(null); setError(null); setIsModalOpen(true); }
  function openEdit(item: ApiEndpointItem) { setEditItem(item); setError(null); setIsModalOpen(true); }

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

      {/* 챗봇 선택은 좌측 상단 '현재 챗봇' 드롭다운으로 통일 */}

      {error && (
        <p style={{ fontSize: 13, color: "#dc2626", padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{error}</p>
      )}

      {testResult && (
        <div style={{
          fontSize: 13, padding: "10px 14px", borderRadius: 8,
          background: testResult.ok ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}`,
          color: testResult.ok ? "#166534" : "#dc2626",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <strong>[{testResult.name}] 테스트 {testResult.ok ? "성공" : "실패"}</strong>
            <div style={{ marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: testResult.ok ? "monospace" : "inherit", color: testResult.ok ? "#334155" : "#dc2626" }}>
              {testResult.ok ? `응답 미리보기: ${testResult.msg}` : testResult.msg}
            </div>
          </div>
          <button type="button" onClick={() => setTestResult(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", flexShrink: 0 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
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
            onClick={openCreate}
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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #e5e7eb" }}>
              {["API 이름", "트리거 질문", "API endpoint", "생성일", "관리"].map(col => (
                <th key={col} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280", background: "#f9fafb" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>불러오는 중...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
                  등록된 API 연동 규칙이 없습니다.
                </td>
              </tr>
            ) : items.map(item => (
              <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "14px 16px", fontWeight: 500, color: "#111827" }}>
                  {item.name}
                  {/* 목록형은 답변 모양이 달라지므로 목록에서도 구분되게 표시한다. */}
                  {item.responseType === "list" && (
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", borderRadius: 4, padding: "1px 6px" }}>목록형</span>
                  )}
                </td>
                <td style={{ padding: "14px 16px", color: "#6b7280", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerLabel(item)}</td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#475569", borderRadius: 4, padding: "1px 6px" }}>{item.method}</span>
                    <span style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{item.endpointUrl}</span>
                  </div>
                </td>
                <td style={{ padding: "14px 16px", color: "#9ca3af", fontSize: 12 }}>{formatDate(item.createdAt)}</td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button type="button" onClick={() => void testEndpoint(item)} disabled={testingId === item.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 12, color: "#374151", cursor: testingId === item.id ? "wait" : "pointer" }}>
                      {testingId === item.id ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : null}
                      테스트
                    </button>
                    <button type="button" onClick={() => openEdit(item)}
                      style={{ padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 12, color: "#374151", cursor: "pointer" }}>
                      수정
                    </button>
                    <button type="button" onClick={() => void remove(item.id)} title="삭제"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 4 }}>
                      <Trash2 style={{ width: 15, height: 15 }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

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
        onClose={() => { setIsModalOpen(false); setEditItem(null); }}
        chatbotId={chatbotId}
        editItem={editItem}
        onSaved={() => { setToast(editItem ? "API 연동이 수정되었습니다." : "API 연동이 추가되었습니다."); void load(); }}
      />
    </div>
  );
}
