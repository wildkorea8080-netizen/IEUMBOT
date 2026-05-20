"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Plus, Smile, X, Zap } from "lucide-react";

import {
  AI_CHATBOT_STORAGE_KEY,
  AiSettingsLayout,
  SectionCard,
  RadioCardGroup,
  ToggleField,
  SaveButton,
  ToastNotice,
} from "../../../../components/admin/ai-settings-layout";
import { ApiClientError } from "../../../../lib/api";
import { getAdminChatbot, getAdminChatbots, patchAdminChatbot } from "../../../../lib/api/admin-operations";
import { getAnswerSettings, patchAnswerSettings } from "../../../../lib/api/answer-settings";
import type { AnswerSettings } from "../../../../lib/api/answer-settings-types";
import type { AdminChatbotItem, AdminChatbotResponse } from "../../../../lib/api/admin-operations-types";

// ── 타입 ──────────────────────────────────────────────────

type FormatRule = {
  keywords: string[];
  format: "text" | "view" | "list";
  moreLink?: { title: string; url: string } | null;
};

type StyleForm = {
  tonePreset: "public" | "friendly" | "concise";
  responseLength: "short" | "medium" | "long";
  citationDisplay: "always" | "bottom" | "folded";
  limitDefinitiveExpression: boolean;
  showFreshnessNotice: boolean;
  customInstructions: string;
  // 추천 질문 풀
  recommendedQuestionsPool: string[];
  // 고급 설정
  followUpEnabled: boolean;
  sentimentAnalysis: boolean;
  multilingualEnabled: boolean;
  autoLinkify: boolean;
  autoBold: boolean;
  // 응답 형식 규칙
  responseFormatRules: FormatRule[];
};

const DEFAULT_FORM: StyleForm = {
  tonePreset: "public", responseLength: "medium", citationDisplay: "always",
  limitDefinitiveExpression: true, showFreshnessNotice: true, customInstructions: "",
  recommendedQuestionsPool: [],
  followUpEnabled: true, sentimentAnalysis: false, multilingualEnabled: false,
  autoLinkify: false, autoBold: false,
  responseFormatRules: [],
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "요청 처리 중 오류가 발생했습니다.";
}

function cloneSettings(settings: AnswerSettings): AnswerSettings {
  return JSON.parse(JSON.stringify(settings)) as AnswerSettings;
}

function deriveTonePreset(chatbot: AdminChatbotResponse, settings: AnswerSettings): StyleForm["tonePreset"] {
  const preset = String((chatbot.theme ?? {}).aiTonePreset ?? "");
  if (preset === "public" || preset === "friendly" || preset === "concise") return preset;
  if (settings.promptInstruction.toneMode === "formal") return "public";
  if (settings.promptInstruction.toneMode === "plain") return "concise";
  return "friendly";
}

function deriveCitationDisplay(chatbot: AdminChatbotResponse, settings: AnswerSettings): StyleForm["citationDisplay"] {
  const stored = String((chatbot.theme ?? {}).aiCitationPresentation ?? "");
  if (stored === "always" || stored === "bottom" || stored === "folded") return stored;
  if (settings.answerFormat.citationDisplayMode === "compact") return "folded";
  return "always";
}

// ── 추천 질문 풀 에디터 ────────────────────────────────────

const MAX_QUESTIONS = 6;

function RecommendedQuestionsEditor({
  questions, onChange,
}: { questions: string[]; onChange: (qs: string[]) => void }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(i: number) {
    setEditingIdx(i);
    setEditValue(questions[i]);
  }

  function commitEdit(i: number) {
    const v = editValue.trim();
    if (!v) { remove(i); } else { onChange(questions.map((q, j) => j === i ? v : q)); }
    setEditingIdx(null);
  }

  function addEmpty() {
    if (questions.length >= MAX_QUESTIONS) return;
    const next = [...questions, ""];
    onChange(next);
    setEditingIdx(next.length - 1);
    setEditValue("");
  }

  function remove(i: number) {
    setEditingIdx(null);
    onChange(questions.filter((_, j) => j !== i));
  }

  return (
    <div>
      {/* 질문 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {questions.map((q, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #e2e8f0", borderRadius: 8, padding: "0 10px", background: "#fff" }}>
            {editingIdx === i ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(i)}
                onKeyDown={e => { if (e.key === "Enter") commitEdit(i); if (e.key === "Escape") setEditingIdx(null); }}
                maxLength={60}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, padding: "10px 0", background: "transparent" }}
              />
            ) : (
              <span
                onClick={() => startEdit(i)}
                style={{ flex: 1, fontSize: 13, color: q ? "#374151" : "#94a3b8", padding: "10px 0", cursor: "text", userSelect: "none" }}
              >
                {q || "질문을 입력하세요"}
              </span>
            )}
            <button type="button" onClick={() => remove(i)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px", flexShrink: 0 }}>
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>
        ))}
      </div>

      {/* 추가 버튼 */}
      {questions.length < MAX_QUESTIONS ? (
        <button
          type="button"
          onClick={addEmpty}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", border: "1.5px dashed #d1d5db", borderRadius: 8,
            background: "none", cursor: "pointer", fontSize: 13, color: "#6b7280",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus style={{ width: 14, height: 14 }} />추천 질문 추가
          </span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{questions.length}/{MAX_QUESTIONS}</span>
        </button>
      ) : (
        <div style={{ textAlign: "right", fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
          {MAX_QUESTIONS}/{MAX_QUESTIONS} · 최대 등록 수에 도달했습니다
        </div>
      )}

      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
        등록된 질문은 현재 대화 맥락에 따라 가장 관련성 높은 3개가 자동으로 추천됩니다.
      </p>
    </div>
  );
}

// ── 응답 형식 규칙 에디터 ──────────────────────────────────

const FORMAT_LABELS: Record<string, string> = { text: "텍스트", view: "카드형", list: "리스트" };

function FormatRulesEditor({ rules, onChange }: { rules: FormatRule[]; onChange: (r: FormatRule[]) => void }) {
  const [kwInput, setKwInput] = useState("");
  const [fmt, setFmt] = useState<FormatRule["format"]>("text");
  const [mlTitle, setMlTitle] = useState("");
  const [mlUrl, setMlUrl] = useState("");
  const [editKws, setEditKws] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  function addRule() {
    if (editKws.length === 0) return;
    onChange([...rules, { keywords: editKws, format: fmt, moreLink: mlTitle && mlUrl ? { title: mlTitle, url: mlUrl } : null }]);
    setEditKws([]); setFmt("text"); setMlTitle(""); setMlUrl(""); setAdding(false);
  }

  function addKw() {
    const kw = kwInput.trim();
    if (!kw || editKws.includes(kw)) return;
    setEditKws(p => [...p, kw]); setKwInput("");
  }

  return (
    <div>
      {rules.length === 0 && !adding ? (
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>등록된 규칙이 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {rules.map((rule, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
              <div style={{ flex: 1, fontSize: 13 }}>
                <span className="badge-neutral" style={{ marginRight: 6 }}>{FORMAT_LABELS[rule.format]}</span>
                {rule.keywords.map(k => <span key={k} style={{ fontSize: 11, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "1px 6px", marginRight: 4, color: "#1d4ed8" }}>{k}</span>)}
                {rule.moreLink && <span style={{ fontSize: 11, color: "#64748b", marginLeft: 4 }}>→ {rule.moreLink.title}</span>}
              </div>
              <button type="button" onClick={() => onChange(rules.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, background: "#f8fafc" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={kwInput} onChange={e => setKwInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKw(); } }}
              placeholder="키워드 입력 후 Enter" className="input-field" style={{ flex: 1 }} />
            <select value={fmt} onChange={e => setFmt(e.target.value as FormatRule["format"])} className="input-field" style={{ width: 100 }}>
              <option value="text">텍스트</option>
              <option value="view">카드형</option>
              <option value="list">리스트</option>
            </select>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {editKws.map(k => (
              <span key={k} style={{ fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                {k}<button type="button" onClick={() => setEditKws(p => p.filter(x => x !== k))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 11 }}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <input value={mlTitle} onChange={e => setMlTitle(e.target.value)} placeholder="더보기 텍스트 (선택)" className="input-field" />
            <input value={mlUrl} onChange={e => setMlUrl(e.target.value)} placeholder="더보기 URL (선택)" className="input-field" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={addRule} disabled={editKws.length === 0} className="btn-primary" style={{ padding: "7px 16px", fontSize: 13, opacity: editKws.length === 0 ? 0.5 : 1 }}>규칙 추가</button>
            <button type="button" onClick={() => { setAdding(false); setEditKws([]); }} className="btn-secondary" style={{ padding: "7px 12px", fontSize: 13 }}>취소</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", fontSize: 13 }}>
          <Plus style={{ width: 13, height: 13 }} />규칙 추가
        </button>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export default function AdminAiStylePage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [selectedChatbot, setSelectedChatbot] = useState<AdminChatbotResponse | null>(null);
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [form, setForm] = useState<StyleForm>(DEFAULT_FORM);
  const [snapshot, setSnapshot] = useState<StyleForm>(DEFAULT_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);

  async function loadPage(chatbotId?: string) {
    const chatbotList = await getAdminChatbots();
    setChatbots(chatbotList.items);
    const stored = window.localStorage.getItem(AI_CHATBOT_STORAGE_KEY) ?? "";
    const preferred = chatbotList.items.find(it => it.id === (chatbotId || selectedChatbotId || stored)) ?? chatbotList.items[0] ?? null;
    if (!preferred) { setSelectedChatbotId(""); setIsLoading(false); return; }

    setIsLoading(true); setError(null);
    try {
      const [chatbot, settings] = await Promise.all([getAdminChatbot(preferred.id), getAnswerSettings(preferred.id)]);
      const theme = (chatbot.theme ?? {}) as Record<string, unknown>;
      const pool = Array.isArray(theme.recommendedQuestionsPool) ? theme.recommendedQuestionsPool as string[] : [];
      const nextForm: StyleForm = {
        tonePreset: deriveTonePreset(chatbot, settings.settings),
        responseLength: chatbot.answerLength as StyleForm["responseLength"],
        citationDisplay: deriveCitationDisplay(chatbot, settings.settings),
        limitDefinitiveExpression: settings.settings.answerPolicy.disallowDefinitiveClaims,
        showFreshnessNotice: settings.settings.answerPolicy.requireLatestSourceCheckWarningWhenRelevant,
        customInstructions: chatbot.customInstructions ?? "",
        recommendedQuestionsPool: pool,
        followUpEnabled:    theme.followUpEnabled !== false,
        sentimentAnalysis:  !!theme.sentimentAnalysis,
        multilingualEnabled: !!theme.multilingualEnabled,
        autoLinkify:        !!theme.autoLinkify,
        autoBold:           !!theme.autoBold,
        responseFormatRules: (chatbot.responseFormatRules ?? []) as FormatRule[],
      };
      setSelectedChatbot(chatbot);
      setServerSettings(settings.settings);
      setForm(nextForm);
      setSnapshot(nextForm);
      setSelectedChatbotId(preferred.id);
      window.localStorage.setItem(AI_CHATBOT_STORAGE_KEY, preferred.id);
    } catch (e) { setError(getErrorMessage(e)); } finally { setIsLoading(false); }
  }

  useEffect(() => { void loadPage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function save() {
    if (!selectedChatbotId || !selectedChatbot || !serverSettings) return;
    setIsSaving(true); setError(null);
    try {
      const toneMode = form.tonePreset === "public" ? "formal" : form.tonePreset === "concise" ? "plain" : "polite";
      const citationDisplayMode = form.citationDisplay === "folded" ? "compact" : "visible";
      await patchAdminChatbot(selectedChatbotId, {
        tone: toneMode,
        answerLength: form.responseLength,
        citationMode: citationDisplayMode,
        theme: {
          ...(selectedChatbot.theme ?? {}),
          aiTonePreset: form.tonePreset,
          aiCitationPresentation: form.citationDisplay,
          recommendedQuestionsPool: form.recommendedQuestionsPool,
          followUpEnabled: form.followUpEnabled,
          sentimentAnalysis: form.sentimentAnalysis,
          multilingualEnabled: form.multilingualEnabled,
          autoLinkify: form.autoLinkify,
          autoBold: form.autoBold,
        },
        customInstructions: form.customInstructions,
        responseFormatRules: form.responseFormatRules,
      });
      const next = cloneSettings(serverSettings);
      next.promptInstruction.toneMode = toneMode;
      next.answerFormat.maxAnswerLengthMode = form.responseLength;
      next.answerFormat.citationDisplayMode = citationDisplayMode;
      next.answerPolicy.disallowDefinitiveClaims = form.limitDefinitiveExpression;
      next.answerPolicy.requireLatestSourceCheckWarningWhenRelevant = form.showFreshnessNotice;
      await patchAnswerSettings(selectedChatbotId, { settings: next });
      await loadPage(selectedChatbotId);
      setToast({ tone: "success", message: "응답 스타일 설정이 저장되었습니다." });
    } catch (e) {
      const msg = getErrorMessage(e);
      setError(msg);
      setToast({ tone: "error", message: msg });
    } finally { setIsSaving(false); }
  }

  return (
    <AiSettingsLayout
      activeHref="/admin/ai/style"
      chatbotOptions={chatbots}
      selectedChatbotId={selectedChatbotId}
      selectedChatbotName={selectedChatbot?.name}
      onSelectChatbot={id => { setSelectedChatbotId(id); void loadPage(id); }}
      notice={toast ? <ToastNotice tone={toast.tone} message={toast.message} /> : error ? <ToastNotice tone="error" message={error} /> : null}
    >
      {isLoading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>불러오는 중...</div>
      ) : !selectedChatbotId ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>이 기관에 연결된 챗봇이 없습니다.</div>
      ) : (
        <>
          {/* 섹션 1: 응답 톤 */}
          <SectionCard title="응답 톤 설정" description="기관 성격에 맞는 기본 응답 스타일을 선택합니다.">
            <RadioCardGroup
              label="말투 선택"
              value={form.tonePreset}
              onChange={v => setForm(p => ({ ...p, tonePreset: v as StyleForm["tonePreset"] }))}
              options={[
                { value: "public", icon: <Building2 style={{ width: 20, height: 20 }} />, title: "공공기관형", description: "격식 있고 단정한 안내 중심 표현을 사용합니다." },
                { value: "friendly", icon: <Smile style={{ width: 20, height: 20 }} />, title: "친절한 상담형", description: "부드럽고 설명적인 상담형 안내를 사용합니다." },
                { value: "concise", icon: <Zap style={{ width: 20, height: 20 }} />, title: "간결한 안내형", description: "핵심 위주로 짧고 빠르게 답변합니다." },
              ]}
            />
          </SectionCard>

          {/* 섹션 2: 답변 길이 */}
          <SectionCard title="답변 길이">
            <RadioCardGroup
              label="응답 길이"
              value={form.responseLength}
              onChange={v => setForm(p => ({ ...p, responseLength: v as StyleForm["responseLength"] }))}
              options={[
                { value: "short", title: "짧게", description: "핵심 답변만 빠르게 제공합니다." },
                { value: "medium", title: "보통", description: "일반 운영 환경에 맞는 기본 길이입니다." },
                { value: "long", title: "자세히", description: "이유와 주의사항까지 비교적 자세히 제공합니다." },
              ]}
            />
          </SectionCard>

          {/* 섹션 3: 출처 표시 */}
          <SectionCard title="출처 표시 방식" description="현재 런타임이 지원하는 범위 안에서 운영자 친화적인 표현으로 제공합니다.">
            <RadioCardGroup
              label="출처 표시 방식"
              value={form.citationDisplay}
              onChange={v => setForm(p => ({ ...p, citationDisplay: v as StyleForm["citationDisplay"] }))}
              options={[
                { value: "always", title: "항상 표시", description: "답변과 함께 출처를 바로 보여줍니다." },
                { value: "bottom", title: "답변 하단 표시", description: "답변 본문 뒤에 출처를 정리해 보여줍니다." },
                { value: "folded", title: "접기 형태 표시", description: "현재 구조에서는 요약형 출처 표시로 매핑됩니다." },
              ]}
            />
          </SectionCard>

          {/* 섹션 4: 주의 표현 */}
          <SectionCard title="주의 표현" description="운영상 민감한 표현을 기본 응답 톤에서 제어합니다.">
            <div>
              <ToggleField label="확정 표현 제한" description="지원 대상 확정, 결과 보장처럼 단정적인 표현을 기본적으로 제한합니다." checked={form.limitDefinitiveExpression} onChange={v => setForm(p => ({ ...p, limitDefinitiveExpression: v }))} />
              <ToggleField label="최신성 주의문 표시" description="최신 공고나 변경 가능성이 있는 정보에는 확인 안내 문구를 우선 표시합니다." checked={form.showFreshnessNotice} onChange={v => setForm(p => ({ ...p, showFreshnessNotice: v }))} />
            </div>
          </SectionCard>

          {/* 섹션 5: 추가 지시문 */}
          <SectionCard title="추가 지시문" description="이 챗봇에만 적용할 자유 형식 지시사항을 입력합니다. System Prompt 마지막에 삽입됩니다. (최대 500자)">
            <textarea value={form.customInstructions} onChange={e => setForm(p => ({ ...p, customInstructions: e.target.value.slice(0, 500) }))} rows={4} className="input-field" placeholder="예: 답변 마지막에 반드시 담당자 연락처를 안내하세요. / 영어 질문에는 한국어로 답변하세요." />
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, textAlign: "right" }}>{form.customInstructions.length} / 500</p>
          </SectionCard>

          {/* 섹션 6: 추천 질문 풀 관리 */}
          <SectionCard
            title="추천 질문 관리"
            description="자주 묻는 질문을 미리 등록하면 AI가 현재 대화와 가장 관련성 높은 질문을 선택해 추천합니다."
          >
            <RecommendedQuestionsEditor
              questions={form.recommendedQuestionsPool}
              onChange={qs => setForm(p => ({ ...p, recommendedQuestionsPool: qs }))}
            />
            {form.recommendedQuestionsPool.length === 0 && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
                💡 등록된 질문이 없으면 AI가 자체적으로 추천 질문을 생성합니다. 자주 묻는 질문을 등록할수록 더 정확한 추천이 가능합니다.
              </div>
            )}
          </SectionCard>

          {/* 섹션 7: 고급 설정 */}
          <SectionCard title="고급 설정" description="AI 대화 에이전트의 추가 기능을 설정하여 더욱 정교한 고객 응대를 구현하세요.">
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* 부정 질문 자동 차단 - 항상 체크, 비활성화 불가 */}
              {[
                {
                  key: "negativeBlock" as const,
                  checked: true,
                  disabled: true,
                  label: "부정 질문 자동 차단",
                  desc: "비방, 욕설, 혐오 등 부적절한 질문에 대해 거부메시지를 자동으로 제공합니다.",
                },
                {
                  key: "sentimentAnalysis" as const,
                  checked: form.sentimentAnalysis,
                  disabled: false,
                  label: "감정 분석 활성화",
                  desc: "고객의 감정 상태를 파악하여 적절한 톤으로 응대합니다.",
                },
                {
                  key: "followUpEnabled" as const,
                  checked: form.followUpEnabled,
                  disabled: false,
                  label: "관련 질문 추천",
                  desc: "대화 중 관련된 질문을 추천합니다.",
                },
                {
                  key: "voiceSupport" as const,
                  checked: false,
                  disabled: true,
                  label: "음성 답변 지원",
                  desc: "텍스트 답변을 음성으로 변환하여 제공합니다.",
                  badge: "베타",
                },
                {
                  key: "multilingualEnabled" as const,
                  checked: form.multilingualEnabled,
                  disabled: false,
                  label: "다국어 지원",
                  desc: "영어, 중국어, 일본어 등 주요 언어로 자동 응대합니다.",
                },
              ].map(({ key, checked, disabled, label, desc, badge }) => (
                <label
                  key={key}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 0", borderBottom: "1px solid #f1f5f9",
                    cursor: disabled ? "default" : "pointer",
                    opacity: disabled && key !== "negativeBlock" ? 0.45 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={e => {
                      if (key === "sentimentAnalysis") setForm(p => ({ ...p, sentimentAnalysis: e.target.checked }));
                      else if (key === "followUpEnabled") setForm(p => ({ ...p, followUpEnabled: e.target.checked }));
                      else if (key === "multilingualEnabled") setForm(p => ({ ...p, multilingualEnabled: e.target.checked }));
                    }}
                    style={{ marginTop: 2, width: 15, height: 15, accentColor: "#2563eb", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.6 }}>
                    <strong style={{ fontWeight: 600 }}>{label}</strong>
                    {badge && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, background: "#f1f5f9", color: "#64748b", borderRadius: 4, padding: "1px 6px", verticalAlign: "middle" }}>
                        {badge}
                      </span>
                    )}
                    {"  "}
                    <span style={{ color: "#6b7280", fontWeight: 400 }}>{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </SectionCard>

          {/* 섹션 8: 응답 형식 규칙 */}
          <SectionCard title="응답 형식 규칙" description="특정 키워드가 포함된 질문에 텍스트/카드/리스트 형식으로 응답을 구조화합니다.">
            <FormatRulesEditor rules={form.responseFormatRules} onChange={rules => setForm(p => ({ ...p, responseFormatRules: rules }))} />
          </SectionCard>

          <SaveButton onClick={() => void save()} disabled={!isDirty || isSaving || isLoading || !selectedChatbotId} isSaving={isSaving} />
        </>
      )}
    </AiSettingsLayout>
  );
}
