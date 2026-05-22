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
  companyName: string;
  specialtyDomain: string;
  tonePreset: "public" | "friendly" | "concise";
  responseLength: "short" | "medium" | "long";
  fallbackMessage: string;
  operatingHoursMessage: string;
  contactPhone: string;
};

function emptyForm(): BasicForm {
  return { chatbotName: "", aiInstructions: "", companyName: "", specialtyDomain: "공공서비스", tonePreset: "friendly", responseLength: "medium", fallbackMessage: "", operatingHoursMessage: "", contactPhone: "" };
}

function cloneSettings(s: AnswerSettings): AnswerSettings {
  return JSON.parse(JSON.stringify(s)) as AnswerSettings;
}

function getErrorMessage(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
}

const SPECIALTY_OPTIONS = ["공공서비스", "교육기관", "의료/복지", "지방자치단체", "농업/농촌", "금융/보험", "관광/문화", "외국어/글로벌", "기타"];

const TONE_OPTIONS = [
  { value: "friendly", label: "친근한" },
  { value: "public",   label: "공공기관형" },
  { value: "concise",  label: "간결한" },
];

// ── 섹션 헤더 ─────────────────────────────────────────────────────────────────

function SectionNum({ n, title, desc }: { n: number; title: string; desc?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#111827", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{n}</div>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: desc ? 4 : 0 }}>{title}</h3>
        {desc && <p style={{ fontSize: 13, color: "#6b7280" }}>{desc}</p>}
      </div>
    </div>
  );
}

// ── 채팅 미리보기 ─────────────────────────────────────────────────────────────

const SAMPLE_PREVIEWS: Record<string, string[]> = {
  friendly: [
    "안녕하세요! 무엇이 궁금하신가요? 편하게 물어봐 주세요 😊",
    "네, 잘 이해했어요! 제가 자세히 설명해 드릴게요.",
    "더 궁금하신 점이 있으시면 언제든지 물어보세요!",
  ],
  public: [
    "안녕하세요. 무엇을 도와드릴까요?",
    "네, 확인해 드리겠습니다. 잠시만 기다려 주세요.",
    "추가 문의사항이 있으시면 말씀해 주세요.",
  ],
  concise: [
    "무엇을 도와드릴까요?",
    "확인했습니다. 관련 내용을 안내해 드릴게요.",
    "다른 문의사항이 있으신가요?",
  ],
};

function ChatPreview({ chatbotName, tone }: { chatbotName: string; tone: string }) {
  const [idx, setIdx] = useState(0);
  const samples = SAMPLE_PREVIEWS[tone] ?? SAMPLE_PREVIEWS.friendly;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
      {/* 헤더 */}
      <div style={{ background: "#111827", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#4b5563", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{chatbotName || "AI 에이전트"}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, background: "#374151", color: "#d1d5db", borderRadius: 20, padding: "2px 10px" }}>
          {TONE_OPTIONS.find(t => t.value === tone)?.label ?? "친근한"}
        </span>
      </div>

      {/* 채팅 영역 */}
      <div style={{ background: "#f9fafb", padding: "20px 16px", minHeight: 120 }}>
        {/* 사용자 메시지 */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <div style={{ background: "#ef4444", color: "#fff", borderRadius: "20px 20px 4px 20px", padding: "8px 14px", fontSize: 13, maxWidth: "70%" }}>
            궁금한 내용이 있어요. 알려주실 수 있나요?
          </div>
        </div>
        {/* AI 메시지 */}
        <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, maxWidth: "85%" }}>
          {samples[idx]}
        </div>
      </div>

      {/* 다른 샘플 보기 */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9" }}>
        <button type="button" onClick={() => setIdx(i => (i + 1) % samples.length)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
          🔄 다른 샘플 보기
        </button>
      </div>
    </div>
  );
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
        suggestedName: string; suggestedRole: string; suggestedDescription: string; suggestedFallback: string;
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
      const theme = (chatbot.theme ?? {}) as Record<string, unknown>;
      const tone = (chatbot.tone === "formal" ? "public" : chatbot.tone === "plain" ? "concise" : "friendly") as BasicForm["tonePreset"];
      const length = (chatbot.answerLength === "short" || chatbot.answerLength === "long" ? chatbot.answerLength : "medium") as BasicForm["responseLength"];
      const next: BasicForm = {
        chatbotName: chatbot.name ?? "",
        aiInstructions: chatbot.customInstructions ?? "",
        companyName: String(ep.defaultDepartmentName ?? ""),
        specialtyDomain: String(theme.specialtyDomain ?? "공공서비스"),
        tonePreset: tone,
        responseLength: length,
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
      const toneMode = form.tonePreset === "public" ? "formal" : form.tonePreset === "concise" ? "plain" : "polite";
      await patchAdminChatbot(selectedChatbotId, {
        name: form.chatbotName.trim(),
        customInstructions: form.aiInstructions.trim(),
        fallbackMessage: form.fallbackMessage.trim(),
        tone: toneMode,
        answerLength: form.responseLength,
        escalationPolicy: {
          ...(selectedChatbot.escalationPolicy ?? {}),
          defaultDepartmentName: form.companyName.trim(),
          representativeContact: form.contactPhone.trim(),
        },
        theme: {
          ...(selectedChatbot.theme ?? {}),
          specialtyDomain: form.specialtyDomain,
          aiTonePreset: form.tonePreset,
        },
      });
      const next = cloneSettings(serverSettings);
      next.answerPolicy.fallbackMessageWhenInsufficientEvidence = form.fallbackMessage.trim();
      next.escalationOperating.operatingHoursFallbackMessage = form.operatingHoursMessage.trim();
      next.promptInstruction.toneMode = toneMode;
      next.answerFormat.maxAnswerLengthMode = form.responseLength;
      await patchAnswerSettings(selectedChatbotId, { settings: next });
      markSetupDone("ai_basic");
      await loadPage(selectedChatbotId);
      setToast({ tone: "success", message: "AI 기본설정이 저장되었습니다." });
    } catch (e) { setToast({ tone: "error", message: getErrorMessage(e) }); }
    finally { setIsSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 14px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", background: "#fff", outline: "none" };
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
                    padding: "14px 18px", border: `2px solid ${setupMode === opt.mode ? "#111827" : "#e5e7eb"}`,
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
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", border: "none", borderRadius: 10, background: (!urlInput.trim() || isAnalyzing) ? "#9ca3af" : "#111827", color: "#fff", fontSize: 13, fontWeight: 500, cursor: (!urlInput.trim() || isAnalyzing) ? "not-allowed" : "pointer" }}>
                    {isAnalyzing ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />분석 중...</> : <><Wand2 style={{ width: 14, height: 14 }} />AI 분석</>}
                  </button>
                </div>
                {analysisDone && (
                  <div style={{ marginTop: 10, padding: "8px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#16a34a" }}>
                    ✓ 분석완료! 웹사이트를 분석하여 아래 설정 항목을 자동으로 채웠습니다. 필요하시면 수정할 수 있습니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── ① AI 역할 설정 ──────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <SectionNum n={1} title="AI 역할 설정" desc="AI 수행할 역할과 응대 방식을 설정합니다." />
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* 에이전트 이름 */}
              <div>
                <label style={labelStyle}>AI 대화 에이전트 이름</label>
                <input value={form.chatbotName} onChange={e => upd("chatbotName", e.target.value)} placeholder="예: 해외농업길잡이" style={inputStyle} />
                <p style={hintStyle}>고객이 대화할 AI 에이전트의 실제 이름입니다.</p>
              </div>

              {/* AI 지침설정 */}
              <div>
                <label style={labelStyle}>AI 지침설정</label>
                <textarea value={form.aiInstructions} onChange={e => upd("aiInstructions", e.target.value)} rows={5} placeholder="AI가 수행할 역할과 답변 방식을 작성합니다.&#10;예: 공공기관 민원 안내 전문가로서 친절하고 정확하게 안내합니다." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
                <p style={hintStyle}>AI가 대답할 때 지켜야 할 역할 또는 지침을 작성합니다</p>
              </div>

              {/* 회사명/기관명 + 전문 분야 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>회사명 또는 기관명</label>
                  <input value={form.companyName} onChange={e => upd("companyName", e.target.value)} placeholder="예: 농림축산식품부" style={inputStyle} />
                  <p style={hintStyle}>AI 응답의 주체를 설정하는 정보입니다.</p>
                </div>
                <div>
                  <label style={labelStyle}>전문 분야</label>
                  <div style={{ position: "relative" }}>
                    <select value={form.specialtyDomain} onChange={e => upd("specialtyDomain", e.target.value)}
                      style={{ ...inputStyle, appearance: "none", paddingRight: 36 }}>
                      {SPECIALTY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9ca3af" }}>▾</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── ② AI 응대 설정 ──────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <SectionNum n={2} title="AI 응대 설정" desc="AI의 응대 방식을 지정하여, 사용자에게 제공할 대화 경험을 설정합니다." />
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* 대화 스타일 */}
              <div>
                <label style={labelStyle}>대화 스타일</label>
                <div style={{ position: "relative" }}>
                  <select value={form.tonePreset} onChange={e => upd("tonePreset", e.target.value as BasicForm["tonePreset"])}
                    style={{ ...inputStyle, appearance: "none", paddingRight: 36 }}>
                    {TONE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9ca3af" }}>▾</div>
                </div>
              </div>

              {/* 응답 길이 슬라이더 */}
              <div>
                <label style={labelStyle}>응답 길이 조절</label>
                <input
                  type="range" min={0} max={2}
                  value={form.responseLength === "short" ? 0 : form.responseLength === "medium" ? 1 : 2}
                  onChange={e => upd("responseLength", (["short", "medium", "long"] as const)[Number(e.target.value)])}
                  style={{ width: "100%", accentColor: "#111827", marginBottom: 6 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9ca3af" }}>
                  <span>간결함</span><span>보통</span><span>자세함</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 응답 정책 메시지 ──────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>응답 정책 메시지</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>답변이 어려운 상황에서 사용자에게 표시할 안내 메시지를 설정합니다.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>운영시간 외 메시지</label>
                <textarea value={form.operatingHoursMessage} onChange={e => upd("operatingHoursMessage", e.target.value)} rows={2}
                  placeholder="현재 운영시간이 아닙니다. 운영시간에 다시 문의해 주세요."
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
              </div>
              <div>
                <label style={labelStyle}>폴백 메시지</label>
                <textarea value={form.fallbackMessage} onChange={e => upd("fallbackMessage", e.target.value)} rows={2}
                  placeholder="현재 등록된 자료에서 해당 내용을 찾기 어렵습니다. 담당 부서에 문의해 주세요."
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
                <p style={hintStyle}>지식베이스에서 답을 찾지 못할 때 표시할 메시지입니다.</p>
              </div>
              <div>
                <label style={labelStyle}>대표 문의 연락처</label>
                <input value={form.contactPhone} onChange={e => upd("contactPhone", e.target.value)} placeholder="예: 02-1234-5678" style={inputStyle} />
                <p style={hintStyle}>이관 안내 시 표시할 대표 연락처입니다.</p>
              </div>
            </div>
          </div>

          {/* ── ③ 대화 샘플 미리보기 ────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <SectionNum n={3} title="대화 샘플 미리보기" desc="위에서 설정한 내용으로 대화 샘플을 확인합니다." />
            <ChatPreview chatbotName={form.chatbotName} tone={form.tonePreset} />
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
              {isSaving ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />저장 중...</> : "저장하기"}
            </button>
          </div>
        </div>
      )}
    </AiSettingsLayout>
  );
}
