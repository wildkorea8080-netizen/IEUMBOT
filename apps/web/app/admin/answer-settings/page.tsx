"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getAnswerSettings, patchAnswerSettings } from "../../../lib/api/answer-settings";
import type { AnswerSettings } from "../../../lib/api/answer-settings-types";

const STORAGE_KEY = "ieumbot_admin_chatbot_id";

const DEFAULT_SETTINGS: AnswerSettings = {
  promptInstruction: {
    systemPrompt: "",
    assistantRoleMode: "policy_guide",
    toneMode: "polite",
    answerStyleMode: "balanced",
    additionalInstructions: "",
  },
  answerPolicy: {
    requireCitations: true,
    disallowAnswerWithoutEvidence: true,
    disallowDefinitiveClaims: true,
    disallowOutcomePrediction: true,
    disallowLegalJudgment: true,
    requireLatestSourceCheckWarningWhenRelevant: true,
    fallbackMessageWhenInsufficientEvidence:
      "현재 등록된 자료에서는 해당 내용을 확인하기 어렵습니다. 관련 사업명, 신청 단계, 또는 대상 기관을 알려주시면 다시 확인해드리겠습니다.",
    clarificationStrategyMode: "ask_one_question",
  },
  answerFormat: {
    answerTemplateMode: "fixed_public_service",
    maxAnswerLengthMode: "medium",
    includeConclusionSection: true,
    includeReasonSection: true,
    includeDetailedGuidanceSection: true,
    includeCautionSection: true,
    citationDisplayMode: "visible",
  },
  modelRuntime: {
    modelName: "gpt-4.1-mini",
    temperature: 0.2,
    maxTokens: 800,
  },
  escalationOperating: {
    enableEscalationSuggestion: true,
    escalationFallbackMessage: "정확한 확인이 필요한 내용입니다. 필요하시면 담당 부서 연결을 안내해드릴 수 있습니다.",
    operatingHoursFallbackMessage:
      "현재 운영시간이 아니므로 즉시 연결이 어렵습니다. 운영시간에 다시 문의해 주세요.",
    afterHoursBehaviorMode: "show_notice",
  },
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

type SelectOption = {
  value: string;
  label: string;
};

const assistantRoleOptions: SelectOption[] = [
  { value: "civil_complaint", label: "민원 상담형" },
  { value: "policy_guide", label: "정책 안내형" },
  { value: "faq_response", label: "FAQ 응답형" },
  { value: "escalation_guide", label: "이관 안내형" },
];
const toneOptions: SelectOption[] = [
  { value: "polite", label: "공손" },
  { value: "formal", label: "격식" },
  { value: "plain", label: "간결" },
];
const answerStyleOptions: SelectOption[] = [
  { value: "concise", label: "짧게" },
  { value: "balanced", label: "균형" },
  { value: "detailed", label: "자세히" },
];
const clarificationOptions: SelectOption[] = [
  { value: "ask_one_question", label: "확인 질문 1개" },
  { value: "ask_stepwise", label: "단계별 확인" },
  { value: "minimal", label: "최소 확인" },
];
const templateOptions: SelectOption[] = [
  { value: "fixed_public_service", label: "공공 고정 템플릿" },
  { value: "standard_structured", label: "표준 구조형" },
];
const answerLengthOptions: SelectOption[] = [
  { value: "short", label: "짧음" },
  { value: "medium", label: "보통" },
  { value: "long", label: "긴 답변" },
];
const citationDisplayOptions: SelectOption[] = [
  { value: "visible", label: "항상 표시" },
  { value: "compact", label: "요약 표시" },
  { value: "hidden", label: "숨김(인용 의무 시 불가)" },
];
const afterHoursOptions: SelectOption[] = [
  { value: "show_notice", label: "안내문 표시" },
  { value: "escalate_only", label: "이관 중심" },
  { value: "allow_limited_answer", label: "제한 답변 허용" },
];

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 text-sm">
      <span>
        <span className="block font-medium text-slate-900">{props.label}</span>
        <span className="mt-1 block text-xs text-slate-600">{props.description}</span>
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="mt-1 size-4"
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  helper?: string;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="font-medium">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {props.helper ? <span className="mt-1 block text-xs text-slate-500">{props.helper}</span> : null}
    </label>
  );
}

export default function AnswerSettingsPage() {
  const [chatbotId, setChatbotId] = useState("");
  const [settings, setSettings] = useState<AnswerSettings>(DEFAULT_SETTINGS);
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [defaultsApplied, setDefaultsApplied] = useState<string[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [normalized, setNormalized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) ?? "";
    if (saved) {
      setChatbotId(saved);
      void loadSettings(saved, true);
    }
  }, []);

  const isDirty = useMemo(() => {
    if (!serverSettings) {
      return false;
    }
    return JSON.stringify(settings) !== JSON.stringify(serverSettings);
  }, [settings, serverSettings]);

  async function loadSettings(targetChatbotId?: string, silent = false) {
    const effectiveChatbotId = (targetChatbotId ?? chatbotId).trim();
    if (!effectiveChatbotId) {
      if (!silent) {
        setErrorMessage("챗봇 ID를 입력하세요.");
      }
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    if (!silent) {
      setSuccessMessage(null);
    }
    try {
      const response = await getAnswerSettings(effectiveChatbotId);
      setSettings(response.settings);
      setServerSettings(response.settings);
      setDefaultsApplied(response.defaultsApplied ?? []);
      setVersion(response.version);
      setUpdatedAt(response.updatedAt);
      setNormalized(response.normalized);
      setChatbotId(effectiveChatbotId);
      window.localStorage.setItem(STORAGE_KEY, effectiveChatbotId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetChatbotId = chatbotId.trim();
    if (!targetChatbotId) {
      setErrorMessage("챗봇 ID를 입력하세요.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await patchAnswerSettings(targetChatbotId, { settings });
      setSettings(response.settings);
      setServerSettings(response.settings);
      setDefaultsApplied(response.defaultsApplied ?? []);
      setVersion(response.version);
      setUpdatedAt(response.updatedAt);
      setNormalized(response.normalized);
      setSuccessMessage("답변·AI 설정이 저장되었습니다.");
      window.localStorage.setItem(STORAGE_KEY, targetChatbotId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function updatePrompt<K extends keyof AnswerSettings["promptInstruction"]>(
    key: K,
    value: AnswerSettings["promptInstruction"][K],
  ) {
    setSettings((prev) => ({
      ...prev,
      promptInstruction: { ...prev.promptInstruction, [key]: value },
    }));
  }

  function updatePolicy<K extends keyof AnswerSettings["answerPolicy"]>(
    key: K,
    value: AnswerSettings["answerPolicy"][K],
  ) {
    setSettings((prev) => ({
      ...prev,
      answerPolicy: { ...prev.answerPolicy, [key]: value },
    }));
  }

  function updateFormat<K extends keyof AnswerSettings["answerFormat"]>(
    key: K,
    value: AnswerSettings["answerFormat"][K],
  ) {
    setSettings((prev) => ({
      ...prev,
      answerFormat: { ...prev.answerFormat, [key]: value },
    }));
  }

  function updateRuntime<K extends keyof AnswerSettings["modelRuntime"]>(
    key: K,
    value: AnswerSettings["modelRuntime"][K],
  ) {
    setSettings((prev) => ({
      ...prev,
      modelRuntime: { ...prev.modelRuntime, [key]: value },
    }));
  }

  function updateEscalation<K extends keyof AnswerSettings["escalationOperating"]>(
    key: K,
    value: AnswerSettings["escalationOperating"][K],
  ) {
    setSettings((prev) => ({
      ...prev,
      escalationOperating: { ...prev.escalationOperating, [key]: value },
    }));
  }

  function onNumberInput(
    event: ChangeEvent<HTMLInputElement>,
    key: "temperature" | "maxTokens",
  ) {
    const value = event.target.value;
    if (key === "temperature") {
      updateRuntime("temperature", Number(value));
      return;
    }
    updateRuntime("maxTokens", Number(value));
  }

  return (
    <div className="space-y-4">
      <PagePanel
        title="답변·AI 설정"
        description="답변 정책, 형식, 모델 런타임 기본값을 운영자가 관리합니다."
      >
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          일부 설정은 현재 정책 점검 단계에서 먼저 반영되고, 최종 생성 파이프라인 연동은 후속 단계에서
          적용됩니다.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={chatbotId}
            onChange={(event) => setChatbotId(event.target.value)}
            placeholder="챗봇 ID (UUID)"
            className="w-full max-w-xl rounded-md border border-slate-300 px-3 py-2 text-sm md:w-auto md:flex-1"
          />
          <button
            type="button"
            onClick={() => loadSettings()}
            disabled={isLoading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {isLoading ? "불러오는 중..." : "서버에서 불러오기"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (serverSettings) {
                setSettings(serverSettings);
              }
            }}
            disabled={!serverSettings || !isDirty}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            수정 취소
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-600">
          버전: {version ?? "-"} | 정규화: {normalized === null ? "-" : String(normalized)} | 최종 갱신:{" "}
          {updatedAt ? new Date(updatedAt).toLocaleString("ko-KR") : "-"}
        </div>
        {defaultsApplied.length > 0 ? (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            기본값 적용: {defaultsApplied.slice(0, 8).join(", ")}
            {defaultsApplied.length > 8 ? ` 외 ${defaultsApplied.length - 8}개` : ""}
          </div>
        ) : null}
      </PagePanel>

      <form onSubmit={onSubmit} className="space-y-4">
        <PagePanel
          title="A. Prompt / Instruction"
          description="운영 목적에 맞는 시스템 지시와 응답 페르소나를 설정합니다."
        >
          <div className="grid gap-3">
            <label className="block text-sm text-slate-700">
              <span className="font-medium">systemPrompt</span>
              <textarea
                rows={7}
                value={settings.promptInstruction.systemPrompt}
                onChange={(event) => updatePrompt("systemPrompt", event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <SelectField
                label="assistantRoleMode"
                value={settings.promptInstruction.assistantRoleMode}
                onChange={(value) =>
                  updatePrompt(
                    "assistantRoleMode",
                    value as AnswerSettings["promptInstruction"]["assistantRoleMode"],
                  )
                }
                options={assistantRoleOptions}
              />
              <SelectField
                label="toneMode"
                value={settings.promptInstruction.toneMode}
                onChange={(value) =>
                  updatePrompt("toneMode", value as AnswerSettings["promptInstruction"]["toneMode"])
                }
                options={toneOptions}
              />
              <SelectField
                label="answerStyleMode"
                value={settings.promptInstruction.answerStyleMode}
                onChange={(value) =>
                  updatePrompt(
                    "answerStyleMode",
                    value as AnswerSettings["promptInstruction"]["answerStyleMode"],
                  )
                }
                options={answerStyleOptions}
              />
            </div>
            <label className="block text-sm text-slate-700">
              <span className="font-medium">additionalInstructions</span>
              <textarea
                rows={3}
                value={settings.promptInstruction.additionalInstructions}
                onChange={(event) => updatePrompt("additionalInstructions", event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </PagePanel>

        <PagePanel
          title="B. Answer Policy"
          description="안전 규칙과 근거 기반 제한을 우선 적용하는 운영 정책입니다."
        >
          <div className="grid gap-2">
            <ToggleRow
              label="requireCitations"
              description="근거 인용이 없으면 답변 허용하지 않습니다."
              checked={settings.answerPolicy.requireCitations}
              onChange={(value) => updatePolicy("requireCitations", value)}
            />
            <ToggleRow
              label="disallowAnswerWithoutEvidence"
              description="근거 부족 시 답변 생성을 차단합니다."
              checked={settings.answerPolicy.disallowAnswerWithoutEvidence}
              onChange={(value) => updatePolicy("disallowAnswerWithoutEvidence", value)}
            />
            <ToggleRow
              label="disallowDefinitiveClaims"
              description="확정형 단정 표현을 제한합니다."
              checked={settings.answerPolicy.disallowDefinitiveClaims}
              onChange={(value) => updatePolicy("disallowDefinitiveClaims", value)}
            />
            <ToggleRow
              label="disallowOutcomePrediction"
              description="결과 예측성 질문을 제한합니다."
              checked={settings.answerPolicy.disallowOutcomePrediction}
              onChange={(value) => updatePolicy("disallowOutcomePrediction", value)}
            />
            <ToggleRow
              label="disallowLegalJudgment"
              description="법률 판단/해석성 응답을 제한합니다."
              checked={settings.answerPolicy.disallowLegalJudgment}
              onChange={(value) => updatePolicy("disallowLegalJudgment", value)}
            />
            <ToggleRow
              label="requireLatestSourceCheckWarningWhenRelevant"
              description="최신성 리스크 시 경고/이관을 유도합니다."
              checked={settings.answerPolicy.requireLatestSourceCheckWarningWhenRelevant}
              onChange={(value) => updatePolicy("requireLatestSourceCheckWarningWhenRelevant", value)}
            />
            <SelectField
              label="clarificationStrategyMode"
              value={settings.answerPolicy.clarificationStrategyMode}
              onChange={(value) =>
                updatePolicy(
                  "clarificationStrategyMode",
                  value as AnswerSettings["answerPolicy"]["clarificationStrategyMode"],
                )
              }
              options={clarificationOptions}
            />
            <label className="block text-sm text-slate-700">
              <span className="font-medium">fallbackMessageWhenInsufficientEvidence</span>
              <textarea
                rows={3}
                value={settings.answerPolicy.fallbackMessageWhenInsufficientEvidence}
                onChange={(event) =>
                  updatePolicy("fallbackMessageWhenInsufficientEvidence", event.target.value)
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </PagePanel>

        <PagePanel
          title="C. Answer Format"
          description="최종 응답 템플릿 구조를 사전 정의합니다."
        >
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <SelectField
                label="answerTemplateMode"
                value={settings.answerFormat.answerTemplateMode}
                onChange={(value) =>
                  updateFormat(
                    "answerTemplateMode",
                    value as AnswerSettings["answerFormat"]["answerTemplateMode"],
                  )
                }
                options={templateOptions}
              />
              <SelectField
                label="maxAnswerLengthMode"
                value={settings.answerFormat.maxAnswerLengthMode}
                onChange={(value) =>
                  updateFormat(
                    "maxAnswerLengthMode",
                    value as AnswerSettings["answerFormat"]["maxAnswerLengthMode"],
                  )
                }
                options={answerLengthOptions}
              />
              <SelectField
                label="citationDisplayMode"
                value={settings.answerFormat.citationDisplayMode}
                onChange={(value) =>
                  updateFormat(
                    "citationDisplayMode",
                    value as AnswerSettings["answerFormat"]["citationDisplayMode"],
                  )
                }
                options={citationDisplayOptions}
                helper="인용 의무(requireCitations)와 충돌하면 저장 시 검증 오류가 발생합니다."
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <ToggleRow
                label="includeConclusionSection"
                description="결론 섹션 포함"
                checked={settings.answerFormat.includeConclusionSection}
                onChange={(value) => updateFormat("includeConclusionSection", value)}
              />
              <ToggleRow
                label="includeReasonSection"
                description="근거 요약 섹션 포함"
                checked={settings.answerFormat.includeReasonSection}
                onChange={(value) => updateFormat("includeReasonSection", value)}
              />
              <ToggleRow
                label="includeDetailedGuidanceSection"
                description="상세 안내 섹션 포함"
                checked={settings.answerFormat.includeDetailedGuidanceSection}
                onChange={(value) => updateFormat("includeDetailedGuidanceSection", value)}
              />
              <ToggleRow
                label="includeCautionSection"
                description="주의사항 섹션 포함"
                checked={settings.answerFormat.includeCautionSection}
                onChange={(value) => updateFormat("includeCautionSection", value)}
              />
            </div>
          </div>
        </PagePanel>

        <PagePanel
          title="D. Model / Runtime"
          description="현재 백엔드가 허용하는 런타임 필드만 표시합니다."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-sm text-slate-700">
              <span className="font-medium">modelName</span>
              <input
                value={settings.modelRuntime.modelName}
                onChange={(event) => updateRuntime("modelName", event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="font-medium">temperature</span>
              <input
                type="number"
                step="0.1"
                min={0}
                max={1}
                value={settings.modelRuntime.temperature}
                onChange={(event) => onNumberInput(event, "temperature")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="font-medium">maxTokens</span>
              <input
                type="number"
                min={128}
                max={4096}
                value={settings.modelRuntime.maxTokens}
                onChange={(event) => onNumberInput(event, "maxTokens")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </PagePanel>

        <PagePanel
          title="E. Escalation / Operating"
          description="답변 불가 시 안전한 안내/이관 메시지 정책을 설정합니다."
        >
          <div className="grid gap-3">
            <ToggleRow
              label="enableEscalationSuggestion"
              description="정책상 답변 불가 시 담당 부서 연결 제안을 활성화합니다."
              checked={settings.escalationOperating.enableEscalationSuggestion}
              onChange={(value) => updateEscalation("enableEscalationSuggestion", value)}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-slate-700">
                <span className="font-medium">escalationFallbackMessage</span>
                <textarea
                  rows={3}
                  value={settings.escalationOperating.escalationFallbackMessage}
                  onChange={(event) => updateEscalation("escalationFallbackMessage", event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm text-slate-700">
                <span className="font-medium">operatingHoursFallbackMessage</span>
                <textarea
                  rows={3}
                  value={settings.escalationOperating.operatingHoursFallbackMessage}
                  onChange={(event) =>
                    updateEscalation("operatingHoursFallbackMessage", event.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <SelectField
              label="afterHoursBehaviorMode"
              value={settings.escalationOperating.afterHoursBehaviorMode}
              onChange={(value) =>
                updateEscalation(
                  "afterHoursBehaviorMode",
                  value as AnswerSettings["escalationOperating"]["afterHoursBehaviorMode"],
                )
              }
              options={afterHoursOptions}
            />
          </div>
        </PagePanel>

        <div className="sticky bottom-0 z-10 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSaving || !chatbotId.trim() || !isDirty}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {isSaving ? "저장 중..." : "설정 저장"}
            </button>
            <button
              type="button"
              onClick={() => loadSettings()}
              disabled={isLoading || isSaving || !chatbotId.trim()}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              서버값으로 다시 불러오기
            </button>
            <span className="text-xs text-slate-500">
              {isDirty ? "저장되지 않은 변경사항이 있습니다." : "서버와 동기화됨"}
            </span>
          </div>
          {successMessage ? (
            <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {successMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
