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

// ── 타입 / 유틸 ──────────────────────────────────────────

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
  // 고급 설정
  multilingualEnabled: boolean;
  autoLinkify: boolean;
  autoBold: boolean;
  responseFormatRules: FormatRule[];
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

// ── 메인 컴포넌트 ─────────────────────────────────────────

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
    const newRule: FormatRule = {
      keywords: editKws,
      format: fmt,
      moreLink: mlTitle && mlUrl ? { title: mlTitle, url: mlUrl } : null,
    };
    onChange([...rules, newRule]);
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
            {editKws.map(k => <span key={k} style={{ fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px", color: "#1d4ed8", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {k}<button type="button" onClick={() => setEditKws(p => p.filter(x => x !== k))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 11 }}>✕</button>
            </span>)}
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

export default function AdminAiStylePage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [selectedChatbot, setSelectedChatbot] = useState<AdminChatbotResponse | null>(null);
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [form, setForm] = useState<StyleForm>({ tonePreset: "public", responseLength: "medium", citationDisplay: "always", limitDefinitiveExpression: true, showFreshnessNotice: true, customInstructions: "", responseFormatRules: [], multilingualEnabled: false, autoLinkify: false, autoBold: false });
  const [snapshot, setSnapshot] = useState<StyleForm>({ tonePreset: "public", responseLength: "medium", citationDisplay: "always", limitDefinitiveExpression: true, showFreshnessNotice: true, customInstructions: "", responseFormatRules: [], multilingualEnabled: false, autoLinkify: false, autoBold: false });
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
      const nextForm: StyleForm = {
        tonePreset: deriveTonePreset(chatbot, settings.settings),
        responseLength: chatbot.answerLength as StyleForm["responseLength"],
        citationDisplay: deriveCitationDisplay(chatbot, settings.settings),
        limitDefinitiveExpression: settings.settings.answerPolicy.disallowDefinitiveClaims,
        showFreshnessNotice: settings.settings.answerPolicy.requireLatestSourceCheckWarningWhenRelevant,
        customInstructions: chatbot.customInstructions ?? "",
        responseFormatRules: (chatbot.responseFormatRules ?? []) as FormatRule[],
        multilingualEnabled: !!(chatbot.theme as Record<string, unknown>)?.multilingualEnabled,
        autoLinkify:         !!(chatbot.theme as Record<string, unknown>)?.autoLinkify,
        autoBold:            !!(chatbot.theme as Record<string, unknown>)?.autoBold,
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
              <ToggleField
                label="확정 표현 제한"
                description="지원 대상 확정, 결과 보장처럼 단정적인 표현을 기본적으로 제한합니다."
                checked={form.limitDefinitiveExpression}
                onChange={v => setForm(p => ({ ...p, limitDefinitiveExpression: v }))}
              />
              <ToggleField
                label="최신성 주의문 표시"
                description="최신 공고나 변경 가능성이 있는 정보에는 확인 안내 문구를 우선 표시합니다."
                checked={form.showFreshnessNotice}
                onChange={v => setForm(p => ({ ...p, showFreshnessNotice: v }))}
              />
            </div>
          </SectionCard>

          {/* 섹션 5: 추가 지시문 */}
          <SectionCard title="추가 지시문" description="이 챗봇에만 적용할 자유 형식 지시사항을 입력합니다. System Prompt 마지막에 삽입됩니다. (최대 500자)">
            <textarea
              value={form.customInstructions}
              onChange={e => setForm(p => ({ ...p, customInstructions: e.target.value.slice(0, 500) }))}
              rows={4}
              className="input-field"
              placeholder="예: 답변 마지막에 반드시 담당자 연락처를 안내하세요. / 영어 질문에는 한국어로 답변하세요."
            />
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, textAlign: "right" }}>
              {form.customInstructions.length} / 500
            </p>
          </SectionCard>

          {/* 섹션 6: 응답 형식 규칙 (Sprint 3-F) */}
          <SectionCard title="응답 형식 규칙" description="특정 키워드가 포함된 질문에 텍스트/카드/리스트 형식으로 응답을 구조화합니다.">
            <FormatRulesEditor
              rules={form.responseFormatRules}
              onChange={rules => setForm(p => ({ ...p, responseFormatRules: rules }))}
            />
          </SectionCard>

          {/* 섹션 7: 고급 설정 */}
          <SectionCard title="고급 설정" description="다국어 지원, 링크 자동 처리 등 AI 응답 세부 동작을 조정합니다.">
            <div>
              <ToggleField
                label="다국어 자동 지원"
                description="사용자 입력 언어를 감지해 동일 언어로 답변합니다. (한국어 외 영어 등 자동 대응)"
                checked={form.multilingualEnabled}
                onChange={v => setForm(p => ({ ...p, multilingualEnabled: v }))}
              />
              <ToggleField
                label="링크 자동 처리"
                description="답변 본문의 URL을 자동으로 클릭 가능한 링크로 변환합니다."
                checked={form.autoLinkify}
                onChange={v => setForm(p => ({ ...p, autoLinkify: v }))}
              />
              <ToggleField
                label="주요 단어 볼드 처리"
                description="답변의 핵심 용어와 제목을 자동으로 굵게 표시합니다."
                checked={form.autoBold}
                onChange={v => setForm(p => ({ ...p, autoBold: v }))}
              />
            </div>
          </SectionCard>

          <SaveButton onClick={() => void save()} disabled={!isDirty || isSaving || isLoading || !selectedChatbotId} isSaving={isSaving} />
        </>
      )}
    </AiSettingsLayout>
  );
}
