"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

import { apiClient } from "../../../../lib/api/client";
import { ApiClientError } from "../../../../lib/api";
import {
  AI_CHATBOT_STORAGE_KEY,
  AiSettingsLayout,
  ToastNotice,
} from "../../../../components/admin/ai-settings-layout";
import { getAdminChatbot, getAdminChatbots, patchAdminChatbot } from "../../../../lib/api/admin-operations";
import { getAnswerSettings, patchAnswerSettings } from "../../../../lib/api/answer-settings";
import { markSetupDone } from "../../../../lib/admin-ui/setup-status";
import type { AnswerSettings } from "../../../../lib/api/answer-settings-types";
import type { AdminChatbotItem, AdminChatbotResponse } from "../../../../lib/api/admin-operations-types";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type SetupMode = "auto" | "manual";

type BasicForm = {
  chatbotName: string;
  aiInstructions: string;
  fallbackMessage: string;
  operatingHoursMessage: string;
  contactPhone: string;
};

function emptyForm(): BasicForm {
  return { chatbotName: "", aiInstructions: "", fallbackMessage: "", operatingHoursMessage: "", contactPhone: "" };
}

function cloneSettings(s: AnswerSettings): AnswerSettings {
  return JSON.parse(JSON.stringify(s)) as AnswerSettings;
}

function getErrorMessage(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function AdminAiBasicPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [selectedChatbot, setSelectedChatbot] = useState<AdminChatbotResponse | null>(null);
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [form, setForm] = useState<BasicForm>(emptyForm);
  const [snapshot, setSnapshot] = useState<BasicForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [setupMode, setSetupMode] = useState<SetupMode>("auto");
  const [urlInput, setUrlInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);
  const upd = <K extends keyof BasicForm>(k: K, v: BasicForm[K]) => setForm(p => ({ ...p, [k]: v }));

  async function analyzeUrl() {
    if (!selectedChatbotId || !urlInput.trim()) return;
    setIsAnalyzing(true); setAnalysisDone(false);
    try {
      const result = await apiClient.request<{
        success: boolean; error?: string;
        suggestedName: string; suggestedDescription: string; suggestedFallback: string;
      }>(`/admin/chatbots/${selectedChatbotId}/analyze-url`, { method: "POST", body: { url: urlInput.trim() } });
      if (result.success) {
        setForm(p => ({
          ...p,
          chatbotName:     result.suggestedName        || p.chatbotName,
          aiInstructions:  result.suggestedDescription  || p.aiInstructions,
          fallbackMessage: result.suggestedFallback     || p.fallbackMessage,
        }));
        setAnalysisDone(true);
      } else {
        setToast({ tone: "error", message: result.error ?? "URL 분석에 실패했습니다." });
      }
    } catch { setToast({ tone: "error", message: "URL 분석에 실패했습니다. URL을 확인해주세요." }); }
    finally { setIsAnalyzing(false); }
  }

  async function loadPage(chatbotId?: string) {
    const chatbotList = await getAdminChatbots();
    setChatbots(chatbotList.items);
    const stored = window.localStorage.getItem(AI_CHATBOT_STORAGE_KEY) ?? "";
    const preferred = chatbotList.items.find(it => it.id === (chatbotId || selectedChatbotId || stored)) ?? chatbotList.items[0] ?? null;
    if (!preferred) { setSelectedChatbotId(""); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const [chatbot, settings] = await Promise.all([getAdminChatbot(preferred.id), getAnswerSettings(preferred.id)]);
      const ep = chatbot.escalationPolicy ?? {};
      const next: BasicForm = {
        chatbotName: chatbot.name ?? "",
        aiInstructions: chatbot.customInstructions ?? "",
        fallbackMessage: chatbot.fallbackMessage ?? settings.settings.answerPolicy.fallbackMessageWhenInsufficientEvidence ?? "",
        operatingHoursMessage: settings.settings.escalationOperating.operatingHoursFallbackMessage ?? "",
        contactPhone: String(ep.representativeContact ?? ""),
      };
      setSelectedChatbot(chatbot); setServerSettings(settings.settings);
      setForm(next); setSnapshot(next);
      setSelectedChatbotId(preferred.id);
      window.localStorage.setItem(AI_CHATBOT_STORAGE_KEY, preferred.id);
    } catch (e) { setToast({ tone: "error", message: getErrorMessage(e) }); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { void loadPage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function save() {
    if (!selectedChatbotId || !selectedChatbot || !serverSettings) return;
    setIsSaving(true);
    try {
      await patchAdminChatbot(selectedChatbotId, {
        name: form.chatbotName.trim(),
        customInstructions: form.aiInstructions.trim(),
        fallbackMessage: form.fallbackMessage.trim(),
        escalationPolicy: {
          ...(selectedChatbot.escalationPolicy ?? {}),
          representativeContact: form.contactPhone.trim(),
        },
      });
      const next = cloneSettings(serverSettings);
      next.answerPolicy.fallbackMessageWhenInsufficientEvidence = form.fallbackMessage.trim();
      next.escalationOperating.operatingHoursFallbackMessage = form.operatingHoursMessage.trim();
      await patchAnswerSettings(selectedChatbotId, { settings: next });
      markSetupDone("ai_basic");
      await loadPage(selectedChatbotId);
      setToast({ tone: "success", message: "AI 기본설정이 저장되었습니다." });
    } catch (e) { setToast({ tone: "error", message: getErrorMessage(e) }); }
    finally { setIsSaving(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", boxSizing: "border-box",
    border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151",
    background: "#fff", outline: "none",
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 };
  const hintStyle: React.CSSProperties = { fontSize: 12, color: "#9ca3af", marginTop: 4 };

  return (
    <AiSettingsLayout
      activeHref="/admin/ai/basic"
      chatbotOptions={chatbots}
      selectedChatbotId={selectedChatbotId}
      selectedChatbotName={selectedChatbot?.name}
      onSelectChatbot={id => { setSelectedChatbotId(id); void loadPage(id); }}
      notice={toast ? <ToastNotice tone={toast.tone} message={toast.message} /> : null}
    >
      {isLoading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>불러오는 중...</div>
      ) : !selectedChatbotId ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>이 기관에 연결된 챗봇이 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── 설정 방식 선택 ──────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 4 }}>설정 방식 선택</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>URL을 입력하면 AI가 설정값을 자동 추천하고, 필요 시 직접 수정할 수 있습니다.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: setupMode === "auto" ? 16 : 0 }}>
              {[
                { mode: "auto" as const, icon: "✨", title: "AI 자동 설정", desc: "웹사이트 URL로 입력하면 자동 완성" },
                { mode: "manual" as const, icon: "✏️", title: "직접 입력", desc: "AI 기본 설정을 직접 입력" },
              ].map(opt => (
                <button key={opt.mode} type="button" onClick={() => setSetupMode(opt.mode)}
                  style={{
                    padding: "14px 18px",
                    border: `2px solid ${setupMode === opt.mode ? "#111827" : "#e5e7eb"}`,
                    borderRadius: 12, background: setupMode === opt.mode ? "#111827" : "#fff",
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{opt.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: setupMode === opt.mode ? "#fff" : "#111827", marginBottom: 2 }}>{opt.title}</div>
                  <div style={{ fontSize: 12, color: setupMode === opt.mode ? "#d1d5db" : "#9ca3af" }}>{opt.desc}</div>
                </button>
              ))}
            </div>

            {setupMode === "auto" && (
              <div>
                <label style={labelStyle}>웹사이트 분석 (URL)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void analyzeUrl(); }}
                    placeholder="https://example.go.kr"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button type="button" onClick={() => void analyzeUrl()} disabled={isAnalyzing || !urlInput.trim()}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "10px 18px", border: "none", borderRadius: 10,
                      background: (!urlInput.trim() || isAnalyzing) ? "#9ca3af" : "#111827",
                      color: "#fff", fontSize: 13, fontWeight: 500,
                      cursor: (!urlInput.trim() || isAnalyzing) ? "not-allowed" : "pointer",
                    }}>
                    {isAnalyzing
                      ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />분석 중...</>
                      : <><Wand2 style={{ width: 14, height: 14 }} />AI 분석</>}
                  </button>
                </div>
                {analysisDone && (
                  <div style={{ marginTop: 10, padding: "8px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#16a34a" }}>
                    ✓ 분석완료! 아래 설정 항목을 자동으로 채웠습니다. 필요하시면 수정할 수 있습니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── AI 역할 설정 ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>AI 역할 설정</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>AI 에이전트의 이름과 답변 시 따를 지침을 설정합니다.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={labelStyle}>AI 대화 에이전트 이름</label>
                <input value={form.chatbotName} onChange={e => upd("chatbotName", e.target.value)}
                  placeholder="예: AI 상담 챗봇" style={inputStyle} />
                <p style={hintStyle}>사용자가 대화하는 AI 에이전트의 이름입니다.</p>
              </div>
              <div>
                <label style={labelStyle}>AI 지침설정</label>
                <textarea value={form.aiInstructions} onChange={e => upd("aiInstructions", e.target.value)}
                  rows={5}
                  placeholder={"AI가 수행할 역할과 답변 방식을 작성합니다.\n예: 기관 업무 관련 전문가로서, 공식 자료를 기반으로 정확하고 친절하게 안내합니다."}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
                <p style={hintStyle}>입력한 내용이 AI의 system prompt에 추가 지시사항으로 삽입되어 실제 답변에 반영됩니다.</p>
              </div>
            </div>
          </div>

          {/* ── 응답 정책 메시지 ──────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>응답 정책 메시지</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>답변이 어려운 상황에서 사용자에게 표시할 안내 메시지를 설정합니다.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>폴백 메시지</label>
                <textarea value={form.fallbackMessage} onChange={e => upd("fallbackMessage", e.target.value)}
                  rows={2}
                  placeholder="현재 등록된 자료에서 해당 내용을 찾기 어렵습니다. 담당 부서에 문의해 주세요."
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
                <p style={hintStyle}>지식베이스에서 답을 찾지 못할 때 실제로 사용자에게 표시되는 메시지입니다.</p>
              </div>
              <div>
                <label style={labelStyle}>운영시간 외 메시지</label>
                <textarea value={form.operatingHoursMessage} onChange={e => upd("operatingHoursMessage", e.target.value)}
                  rows={2}
                  placeholder="현재 운영시간이 아닙니다. 운영시간에 다시 문의해 주세요."
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
              </div>
              <div>
                <label style={labelStyle}>대표 문의 연락처</label>
                <input value={form.contactPhone} onChange={e => upd("contactPhone", e.target.value)}
                  placeholder="예: 02-1234-5678" style={inputStyle} />
                <p style={hintStyle}>이관 안내 시 표시할 대표 연락처입니다.</p>
              </div>
            </div>
          </div>

          {/* ── 저장 버튼 ────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => void save()} disabled={isSaving || isLoading || !isDirty}
              style={{
                padding: "12px 36px", border: "none", borderRadius: 10,
                background: (isSaving || isLoading || !isDirty) ? "#9ca3af" : "#111827",
                color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: (isSaving || isLoading || !isDirty) ? "not-allowed" : "pointer",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}>
              {isSaving
                ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />저장 중...</>
                : "저장하기"}
            </button>
          </div>
        </div>
      )}
    </AiSettingsLayout>
  );
}
