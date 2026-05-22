"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

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

type LayoutType = "fullpage" | "modal" | "sidebar" | "floating";

type FormatRule = {
  keywords: string[];
  format: "text" | "view" | "list";
  moreLink?: { title: string; url: string } | null;
};

type StyleForm = {
  widgetLayoutType: LayoutType;
  primaryColor: string;
  welcomeMessage: string;
  descriptionText: string;
  citationDisplay: "always" | "bottom" | "folded";
  limitDefinitiveExpression: boolean;
  showFreshnessNotice: boolean;
  recommendedQuestionsPool: string[];
  followUpEnabled: boolean;
  sentimentAnalysis: boolean;
  multilingualEnabled: boolean;
  autoLinkify: boolean;
  autoBold: boolean;
  responseFormatRules: FormatRule[];
};

const DEFAULT_FORM: StyleForm = {
  widgetLayoutType: "fullpage",
  primaryColor: "#FF8080",
  welcomeMessage: "당신의 궁금증, 에이전트에게 물어보세요~",
  descriptionText: "",
  citationDisplay: "always",
  limitDefinitiveExpression: true,
  showFreshnessNotice: true,
  recommendedQuestionsPool: [],
  followUpEnabled: true,
  sentimentAnalysis: false,
  multilingualEnabled: false,
  autoLinkify: false,
  autoBold: false,
  responseFormatRules: [],
};

function getErrorMessage(e: unknown) {
  if (e instanceof ApiClientError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
}

function cloneSettings(s: AnswerSettings): AnswerSettings {
  return JSON.parse(JSON.stringify(s)) as AnswerSettings;
}

// ── 색상 프리셋 ───────────────────────────────────────────────────────────────

const COLOR_PRESETS = ["#FF8080", "#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#f59e0b", "#111827"];

// ── 위젯 레이아웃 카드 ─────────────────────────────────────────────────────────

const LAYOUT_OPTIONS: { value: LayoutType; label: string; position: string; preview: React.ReactNode }[] = [
  {
    value: "fullpage", label: "풀페이지", position: "우측 하단",
    preview: (
      <div style={{ width: "100%", height: 100, background: "#f1f5f9", borderRadius: 6, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "#e5e7eb", borderRadius: 4 }} />
        <div style={{ position: "absolute", bottom: 8, right: 8, width: 12, height: 12, borderRadius: "50%", background: "#374151" }} />
      </div>
    ),
  },
  {
    value: "modal", label: "모달형", position: "우측 하단",
    preview: (
      <div style={{ width: "100%", height: 100, background: "#f1f5f9", borderRadius: 6, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: 8, right: 8, width: 40, height: 60, background: "#e5e7eb", borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,.1)" }} />
        <div style={{ position: "absolute", bottom: 8, right: 8, width: 12, height: 12, borderRadius: "50%", background: "#374151" }} />
      </div>
    ),
  },
  {
    value: "sidebar", label: "사이드형", position: "우측 하단",
    preview: (
      <div style={{ width: "100%", height: 100, background: "#f1f5f9", borderRadius: 6, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 40, background: "#e5e7eb" }} />
        <div style={{ position: "absolute", bottom: 8, right: 8, width: 12, height: 12, borderRadius: "50%", background: "#374151" }} />
      </div>
    ),
  },
  {
    value: "floating", label: "플로팅 입력바", position: "",
    preview: (
      <div style={{ width: "100%", height: 100, background: "#f1f5f9", borderRadius: 6, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, height: 16, background: "#e5e7eb", borderRadius: 8 }} />
      </div>
    ),
  },
];

// ── 추천 질문 에디터 ──────────────────────────────────────────────────────────

const MAX_QUESTIONS = 6;

function RecommendedQuestionsEditor({ questions, onChange }: { questions: string[]; onChange: (qs: string[]) => void }) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  function startEdit(i: number) { setEditIdx(i); setEditVal(questions[i]); }
  function commit(i: number) {
    const v = editVal.trim();
    onChange(v ? questions.map((q, j) => j === i ? v : q) : questions.filter((_, j) => j !== i));
    setEditIdx(null);
  }
  function addEmpty() {
    if (questions.length >= MAX_QUESTIONS) return;
    const next = [...questions, ""];
    onChange(next); setEditIdx(next.length - 1); setEditVal("");
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {questions.map((q, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #e5e7eb", borderRadius: 8, padding: "0 10px", background: "#fff" }}>
            {editIdx === i ? (
              <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                onBlur={() => commit(i)} onKeyDown={e => { if (e.key === "Enter") commit(i); }}
                maxLength={60}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, padding: "10px 0", background: "transparent" }} />
            ) : (
              <span onClick={() => startEdit(i)} style={{ flex: 1, fontSize: 13, color: q ? "#374151" : "#94a3b8", padding: "10px 0", cursor: "text" }}>
                {q || "질문을 입력하세요"}
              </span>
            )}
            <button type="button" onClick={() => onChange(questions.filter((_, j) => j !== i))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        ))}
      </div>
      {questions.length < MAX_QUESTIONS ? (
        <button type="button" onClick={addEmpty}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1.5px dashed #d1d5db", borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus style={{ width: 13, height: 13 }} />+ 추천 질문 추가</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{questions.length}/{MAX_QUESTIONS}</span>
        </button>
      ) : (
        <div style={{ textAlign: "right", fontSize: 12, color: "#9ca3af" }}>{MAX_QUESTIONS}/{MAX_QUESTIONS} · 최대 등록 수에 도달했습니다</div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function AdminAiStylePage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [selectedChatbot, setSelectedChatbot] = useState<AdminChatbotResponse | null>(null);
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [form, setForm] = useState<StyleForm>(DEFAULT_FORM);
  const [snapshot, setSnapshot] = useState<StyleForm>(DEFAULT_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);
  const upd = <K extends keyof StyleForm>(k: K, v: StyleForm[K]) => setForm(p => ({ ...p, [k]: v }));

  async function loadPage(chatbotId?: string) {
    const chatbotList = await getAdminChatbots();
    setChatbots(chatbotList.items);
    const stored = window.localStorage.getItem(AI_CHATBOT_STORAGE_KEY) ?? "";
    const preferred = chatbotList.items.find(it => it.id === (chatbotId || selectedChatbotId || stored)) ?? chatbotList.items[0] ?? null;
    if (!preferred) { setSelectedChatbotId(""); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const [chatbot, settings] = await Promise.all([getAdminChatbot(preferred.id), getAnswerSettings(preferred.id)]);
      const theme = (chatbot.theme ?? {}) as Record<string, unknown>;
      const pool = Array.isArray(theme.recommendedQuestionsPool) ? theme.recommendedQuestionsPool as string[] : [];
      const citationDisplay = (() => {
        const stored = String(theme.aiCitationPresentation ?? "");
        if (stored === "always" || stored === "bottom" || stored === "folded") return stored as StyleForm["citationDisplay"];
        return settings.settings.answerFormat.citationDisplayMode === "compact" ? "folded" as const : "always" as const;
      })();
      const next: StyleForm = {
        widgetLayoutType: (String(theme.widgetLayoutType ?? "fullpage")) as LayoutType,
        primaryColor: String(theme.primaryColor ?? "#FF8080"),
        welcomeMessage: chatbot.welcomeMessage ?? "당신의 궁금증, 에이전트에게 물어보세요~",
        descriptionText: chatbot.descriptionText ?? "",
        citationDisplay,
        limitDefinitiveExpression: settings.settings.answerPolicy.disallowDefinitiveClaims,
        showFreshnessNotice: settings.settings.answerPolicy.requireLatestSourceCheckWarningWhenRelevant,
        recommendedQuestionsPool: pool,
        followUpEnabled:    theme.followUpEnabled !== false,
        sentimentAnalysis:  !!theme.sentimentAnalysis,
        multilingualEnabled: !!theme.multilingualEnabled,
        autoLinkify:        !!theme.autoLinkify,
        autoBold:           !!theme.autoBold,
        responseFormatRules: (chatbot.responseFormatRules ?? []) as FormatRule[],
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
      const citationDisplayMode = form.citationDisplay === "folded" ? "compact" : "visible";
      await patchAdminChatbot(selectedChatbotId, {
        welcomeMessage: form.welcomeMessage.trim(),
        descriptionText: form.descriptionText.trim(),
        citationMode: citationDisplayMode,
        responseFormatRules: form.responseFormatRules,
        theme: {
          ...(selectedChatbot.theme ?? {}),
          widgetLayoutType: form.widgetLayoutType,
          primaryColor: form.primaryColor,
          aiCitationPresentation: form.citationDisplay,
          recommendedQuestionsPool: form.recommendedQuestionsPool,
          followUpEnabled: form.followUpEnabled,
          sentimentAnalysis: form.sentimentAnalysis,
          multilingualEnabled: form.multilingualEnabled,
          autoLinkify: form.autoLinkify,
          autoBold: form.autoBold,
        },
      });
      const next = cloneSettings(serverSettings);
      next.answerFormat.citationDisplayMode = citationDisplayMode;
      next.answerPolicy.disallowDefinitiveClaims = form.limitDefinitiveExpression;
      next.answerPolicy.requireLatestSourceCheckWarningWhenRelevant = form.showFreshnessNotice;
      await patchAnswerSettings(selectedChatbotId, { settings: next });
      markSetupDone("ai_style");
      await loadPage(selectedChatbotId);
      setToast({ tone: "success", message: "대화 스타일 설정이 저장되었습니다." });
    } catch (e) { setToast({ tone: "error", message: getErrorMessage(e) }); }
    finally { setIsSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 14px", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", background: "#fff", outline: "none" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 };
  const hintStyle: React.CSSProperties = { fontSize: 12, color: "#9ca3af", marginTop: 4 };

  return (
    <AiSettingsLayout
      activeHref="/admin/ai/style"
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

          {/* ── 대화 위젯 설정 ─────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>대화 위젯 설정</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>웹사이트에 표시될 AI 대화 인터페이스의 스타일을 선택하세요.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {LAYOUT_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => upd("widgetLayoutType", opt.value)}
                  style={{ padding: "12px 10px", border: `2px solid ${form.widgetLayoutType === opt.value ? "#111827" : "#e5e7eb"}`, borderRadius: 10, background: "#fff", cursor: "pointer", textAlign: "center" }}>
                  <div style={{ marginBottom: 8 }}>{opt.preview}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-start" }}>
                    <input type="radio" readOnly checked={form.widgetLayoutType === opt.value} style={{ accentColor: "#111827" }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{opt.label}</span>
                  </div>
                  {opt.position && <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "left", marginLeft: 16 }}>{opt.position}</div>}
                </button>
              ))}
            </div>
          </div>

          {/* ── 색상 설정 ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>색상 설정</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>웹사이트 스타일에 맞는 대화창 색상을 설정하세요.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* 대화 및 버튼 색상 */}
              <div>
                <label style={labelStyle}>대화 및 버튼 색상</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: form.primaryColor, border: "1px solid #e5e7eb", flexShrink: 0 }} />
                  <input value={form.primaryColor} onChange={e => upd("primaryColor", e.target.value)}
                    placeholder="#FF8080" style={{ ...inputStyle, width: 120 }} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {COLOR_PRESETS.map(c => (
                    <button key={c} type="button" onClick={() => upd("primaryColor", c)}
                      style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: `2.5px solid ${form.primaryColor === c ? "#111827" : "transparent"}`, cursor: "pointer" }} />
                  ))}
                </div>
                <p style={hintStyle}>메시지 배경, 버튼 등에 적용됩니다.</p>
              </div>

              {/* 미리보기 */}
              <div>
                <label style={labelStyle}>색상 설정 및 예시 문구 미리보기</label>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 12px", background: form.primaryColor, display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#fff" }}>예시 메시지입니다.</div>
                  </div>
                  <div style={{ padding: "10px 12px", background: "#f9fafb", display: "flex", alignItems: "center", gap: 8 }}>
                    <input placeholder="예시 문구를 입력해주세요." readOnly style={{ flex: 1, border: "none", background: "transparent", fontSize: 12, color: "#9ca3af", outline: "none" }} />
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: form.primaryColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#fff", fontSize: 14 }}>↑</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 인사말 설정 ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>인사말 설정</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>AI 대화 에이전트가 시작될 때 표시할 인사말을 설정하세요.</p>
            <textarea value={form.welcomeMessage} onChange={e => upd("welcomeMessage", e.target.value)} rows={3}
              placeholder="당신의 궁금증, 에이전트에게 물어보세요~"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
          </div>

          {/* ── 설명글 설정 ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>설명글 설정</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>홈페이지 위젯에서 표시될 AI 대화 에이전트 설명글을 설정하세요.</p>
            <textarea value={form.descriptionText} onChange={e => upd("descriptionText", e.target.value)} rows={3}
              placeholder="RAG 기반의 AI 대화형 플랫폼입니다."
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
          </div>

          {/* ── 추천 질문 ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>추천 질문</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>사용자가 버튼을 클릭해 대화를 시작할 수 있도록 추천 질문을 구성하세요. (최대 6개)</p>
            <RecommendedQuestionsEditor
              questions={form.recommendedQuestionsPool}
              onChange={qs => upd("recommendedQuestionsPool", qs)}
            />
          </div>

          {/* ── 고급 설정 ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200" style={{ padding: "20px 24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>고급 설정</h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>AI 대화 에이전트의 추가 기능을 설정하여 더욱 정교한 고객 응대를 구현하세요.</p>
            <div>
              {[
                { key: "negBlock",   checked: true,                      disabled: true,  label: "부정 질문 자동 차단", desc: "비방, 욕설, 혐오 등 부적절한 질문에 대해 거부메시지를 자동으로 제공합니다." },
                { key: "follow",     checked: form.followUpEnabled,       disabled: false, label: "관련 질문 추천",     desc: "대화 중 관련된 질문을 추천합니다." },
                { key: "voice",      checked: false,                      disabled: true,  label: "음성 답변 지원",     desc: "텍스트 답변을 음성으로 변환하여 제공합니다. (베타)" },
                { key: "multilang",  checked: form.multilingualEnabled,   disabled: false, label: "다국어 지원",        desc: "영어, 중국어, 일본어 등 주요 언어로 자동 응답합니다." },
              ].map(item => (
                <label key={item.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid #f1f5f9", cursor: item.disabled ? "default" : "pointer", opacity: (item.disabled && item.key !== "negBlock") ? 0.45 : 1 }}>
                  <input type="checkbox" checked={item.checked} disabled={item.disabled}
                    onChange={e => {
                      if (item.key === "follow") upd("followUpEnabled", e.target.checked);
                      else if (item.key === "multilang") upd("multilingualEnabled", e.target.checked);
                    }}
                    style={{ marginTop: 2, width: 15, height: 15, accentColor: "#2563eb", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.6 }}>
                    <strong style={{ fontWeight: 600 }}>{item.label}</strong>
                    {"  "}
                    <span style={{ color: "#6b7280", fontWeight: 400 }}>{item.desc}</span>
                  </span>
                </label>
              ))}
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
              {isSaving ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />저장 중...</> : "저장하기"}
            </button>
          </div>
        </div>
      )}
    </AiSettingsLayout>
  );
}
