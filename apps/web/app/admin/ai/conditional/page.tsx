"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AI_CHATBOT_STORAGE_KEY,
  AiSettingsLayout,
  RadioCardGroup,
  TextAreaField,
  ToggleField,
  ToastNotice,
} from "../../../../components/admin/ai-settings-layout";
import { PagePanel } from "../../../../components/ui/page-panel";
import { ApiClientError } from "../../../../lib/api";
import { getAdminChatbot, getAdminChatbots, patchAdminChatbot } from "../../../../lib/api/admin-operations";
import { getAnswerSettings, patchAnswerSettings } from "../../../../lib/api/answer-settings";
import type { AnswerSettings } from "../../../../lib/api/answer-settings-types";
import { listEscalationRules } from "../../../../lib/api/escalations";
import type { EscalationRule } from "../../../../lib/api/escalations-types";
import { getGuardrails } from "../../../../lib/api/guardrails";
import type { GuardrailRule } from "../../../../lib/api/guardrails";
import type { AdminChatbotItem, AdminChatbotResponse } from "../../../../lib/api/admin-operations-types";

type ConditionalForm = {
  insufficientEvidenceMode: "block" | "verify" | "escalate";
  afterHoursMode: "basic_notice" | "next_hours" | "contact_info";
  disallowLegalJudgment: boolean;
  disallowBenefitConfirmation: boolean;
  disallowOutcomePrediction: boolean;
  escalationMessage: string;
  showDepartment: boolean;
  showContactChannel: boolean;
};

const TEXT = {
  error: "\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
  saveSuccess: "\uC870\uAC74\uBCC4 \uB2F5\uBCC0 \uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  title: "\uC870\uAC74\uBCC4 \uB2F5\uBCC0 \uC124\uC815",
  description:
    "\uADFC\uAC70 \uBD80\uC871, \uC6B4\uC601\uC2DC\uAC04 \uC678 \uBB38\uC758, \uBBFC\uAC10 \uC9C8\uBB38, \uC774\uAD00 \uC0C1\uD669\uC5D0 \uB300\uD55C \uAE30\uBCF8 \uC751\uB2F5 \uBC29\uD5A5\uC744 \uC6B4\uC601\uC790 \uCE5C\uD654\uC801\uC73C\uB85C \uC124\uC815\uD569\uB2C8\uB2E4.",
  reload: "\uC11C\uBC84\uC5D0\uC11C \uB2E4\uC2DC \uBD88\uB7EC\uC624\uAE30",
  cancel: "\uCDE8\uC18C",
  save: "\uC800\uC7A5",
  saving: "\uC800\uC7A5 \uC911...",
  loadingTitle: "\uBD88\uB7EC\uC624\uB294 \uC911",
  loadingDesc: "\uD604\uC7AC \uCC57\uBD07\uC758 \uC870\uAC74\uBCC4 \uB2F5\uBCC0 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uACE0 \uC788\uC2B5\uB2C8\uB2E4.",
  emptyTitle: "\uCC57\uBD07 \uC5C6\uC74C",
  emptyDesc: "\uC774 \uAE30\uAD00\uC5D0 \uC5F0\uACB0\uB41C \uCC57\uBD07\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  leftTitle: "\uADFC\uAC70 \uBD80\uC871 \uBC0F \uC6B4\uC601\uC2DC\uAC04 \uC678",
  leftDesc: "\uB2F5\uBCC0\uC774 \uC5B4\uB824\uC6B4 \uC0C1\uD669\uC5D0\uC11C\uC758 \uAE30\uBCF8 \uB300\uC751 \uBC29\uC2DD\uC744 \uC120\uD0DD\uD569\uB2C8\uB2E4.",
  sensitiveTitle: "\uBBFC\uAC10 \uC9C8\uBB38 \uB2F5\uBCC0",
  sensitiveDesc:
    "\uBC95\uB960 \uD310\uB2E8, \uC218\uAE09 \uD655\uC815, \uACB0\uACFC \uC608\uCE21\uCC98\uB7FC \uC6B4\uC601\uC0C1 \uBBFC\uAC10\uD55C \uC751\uB2F5 \uBC94\uC704\uB97C \uC81C\uC5B4\uD569\uB2C8\uB2E4.",
  escalateTitle: "\uC774\uAD00 \uD544\uC694 \uC2DC \uB2F5\uBCC0",
  escalateDesc:
    "\uC0C1\uB2F4 \uC5F0\uACB0\uC774 \uD544\uC694\uD55C \uACBD\uC6B0 \uC6B4\uC601\uC790 \uCE5C\uD654\uC801\uC778 \uC815\uBCF4\uB9CC \uB178\uCD9C\uD558\uB3C4\uB85D \uC815\uB9AC\uD569\uB2C8\uB2E4.",
  rulesTitle: "\uACE0\uAE09 \uADDC\uCE59 \uD604\uD669",
  rulesDesc:
    "\uBCF5\uC7A1\uD55C \uB0B4\uBD80 \uB8F0 ID \uB300\uC2E0 \uD604\uC7AC \uC801\uC6A9 \uC911\uC778 \uACE0\uAE09 \uADDC\uCE59 \uAC74\uC218\uB9CC \uC694\uC57D\uD574 \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.",
  insufficient: "\uADFC\uAC70 \uBD80\uC871 \uC2DC \uB2F5\uBCC0",
  afterHours: "\uC6B4\uC601\uC2DC\uAC04 \uC678 \uB2F5\uBCC0",
  legal: "\uBC95\uB960\uD310\uB2E8 \uAE08\uC9C0",
  legalDesc: "\uBC95\uB960 \uD574\uC11D\uC774\uB098 \uD310\uB2E8\uC744 \uB2E8\uC815\uC801\uC73C\uB85C \uB2F5\uD558\uC9C0 \uC54A\uB3C4\uB85D \uC81C\uD55C\uD569\uB2C8\uB2E4.",
  benefit: "\uC218\uAE09/\uC9C0\uC6D0 \uD655\uC815 \uAE08\uC9C0",
  benefitDesc: "\uC9C0\uC6D0 \uB300\uC0C1 \uD655\uC815\uC774\uB098 \uC218\uAE09 \uC5EC\uBD80\uB97C \uB2E8\uC815\uC801\uC73C\uB85C \uC548\uB0B4\uD558\uC9C0 \uC54A\uB3C4\uB85D \uC81C\uD55C\uD569\uB2C8\uB2E4.",
  outcome: "\uBBFC\uC6D0 \uACB0\uACFC \uC608\uCE21 \uAE08\uC9C0",
  outcomeDesc: "\uCC98\uB9AC \uACB0\uACFC\uB098 \uC2B9\uC778 \uAC00\uB2A5\uC131\uC744 \uC608\uCE21\uD558\uB294 \uB2F5\uBCC0\uC744 \uC81C\uD55C\uD569\uB2C8\uB2E4.",
  escalationMessage: "\uC774\uAD00 \uC548\uB0B4 \uBA54\uC2DC\uC9C0",
  showDepartment: "\uB2F4\uB2F9 \uBD80\uC11C \uD45C\uC2DC",
  showDepartmentDesc:
    "\uAE30\uBCF8 \uC124\uC815\uC5D0 \uC800\uC7A5\uB41C \uB2F4\uB2F9 \uBD80\uC11C\uBA85\uC744 \uC774\uAD00 \uC548\uB0B4\uC5D0 \uD3EC\uD568\uD560 \uC218 \uC788\uB3C4\uB85D \uC720\uC9C0\uD569\uB2C8\uB2E4.",
  showContact: "\uBB38\uC758 \uCC44\uB110 \uD45C\uC2DC",
  showContactDesc:
    "\uAE30\uBCF8 \uC124\uC815\uC5D0 \uC800\uC7A5\uB41C \uB300\uD45C \uBB38\uC758 \uC5F0\uB77D\uCC98\uB97C \uC774\uAD00 \uC548\uB0B4\uC5D0 \uD3EC\uD568\uD560 \uC218 \uC788\uB3C4\uB85D \uC720\uC9C0\uD569\uB2C8\uB2E4.",
  guardrails: "\uD65C\uC131 guardrails",
  escalations: "\uD65C\uC131 escalation rules",
  rulesHelper: "\uC0C1\uC138 \uADDC\uCE59 \uD3B8\uC9D1\uC740 \uAE30\uC874 \uACE0\uAE09 \uC124\uC815 \uD654\uBA74\uC5D0\uC11C \uACC4\uC18D \uAD00\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
} as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return TEXT.error;
}

function cloneSettings(settings: AnswerSettings): AnswerSettings {
  return JSON.parse(JSON.stringify(settings)) as AnswerSettings;
}

function buildAfterHoursMessage(
  mode: ConditionalForm["afterHoursMode"],
  departmentName: string,
  contactPhone: string,
) {
  if (mode === "contact_info") {
    const target = [departmentName, contactPhone].filter(Boolean).join(" / ");
    if (target) {
      return `\uD604\uC7AC \uC6B4\uC601\uC2DC\uAC04\uC774 \uC544\uB2C8\uBBC0\uB85C \uC989\uC2DC \uC5F0\uACB0\uC740 \uC5B4\uB835\uC2B5\uB2C8\uB2E4. ${target}\uB85C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.`;
    }
    return "\uD604\uC7AC \uC6B4\uC601\uC2DC\uAC04\uC774 \uC544\uB2C8\uBBC0\uB85C \uC989\uC2DC \uC5F0\uACB0\uC740 \uC5B4\uB835\uC2B5\uB2C8\uB2E4. \uB300\uD45C \uBB38\uC758\uCC98\uB85C \uC5F0\uB77D\uD574 \uC8FC\uC138\uC694.";
  }
  if (mode === "next_hours") {
    return "\uD604\uC7AC \uC6B4\uC601\uC2DC\uAC04\uC774 \uC544\uB2C8\uBBC0\uB85C \uC989\uC2DC \uC5F0\uACB0\uC740 \uC5B4\uB835\uC2B5\uB2C8\uB2E4. \uB2E4\uC74C \uC6B4\uC601\uC2DC\uAC04\uC5D0 \uB2E4\uC2DC \uBB38\uC758\uD574 \uC8FC\uC138\uC694.";
  }
  return "\uD604\uC7AC \uC6B4\uC601\uC2DC\uAC04\uC774 \uC544\uB2C8\uBBC0\uB85C \uC989\uC2DC \uC5F0\uACB0\uC740 \uC5B4\uB835\uC2B5\uB2C8\uB2E4. \uC6B4\uC601\uC2DC\uAC04 \uB0B4\uC5D0 \uB2E4\uC2DC \uBB38\uC758\uD574 \uC8FC\uC138\uC694.";
}

function deriveInsufficientMode(settings: AnswerSettings): ConditionalForm["insufficientEvidenceMode"] {
  if (settings.escalationOperating.enableEscalationSuggestion) return "escalate";
  if (settings.answerPolicy.clarificationStrategyMode === "minimal") return "block";
  return "verify";
}

function deriveAfterHoursMode(chatbot: AdminChatbotResponse): ConditionalForm["afterHoursMode"] {
  const mode = String((chatbot.businessHours ?? {}).aiAfterHoursMode ?? "");
  if (mode === "basic_notice" || mode === "next_hours" || mode === "contact_info") return mode;
  return "basic_notice";
}

export default function AdminAiConditionalPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [selectedChatbot, setSelectedChatbot] = useState<AdminChatbotResponse | null>(null);
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [guardrails, setGuardrails] = useState<GuardrailRule[]>([]);
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([]);
  const [form, setForm] = useState<ConditionalForm>({
    insufficientEvidenceMode: "verify",
    afterHoursMode: "basic_notice",
    disallowLegalJudgment: true,
    disallowBenefitConfirmation: true,
    disallowOutcomePrediction: true,
    escalationMessage: "",
    showDepartment: true,
    showContactChannel: true,
  });
  const [snapshot, setSnapshot] = useState<ConditionalForm>({
    insufficientEvidenceMode: "verify",
    afterHoursMode: "basic_notice",
    disallowLegalJudgment: true,
    disallowBenefitConfirmation: true,
    disallowOutcomePrediction: true,
    escalationMessage: "",
    showDepartment: true,
    showContactChannel: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);

  async function loadPage(chatbotId?: string) {
    const chatbotList = await getAdminChatbots();
    setChatbots(chatbotList.items);
    const stored = window.localStorage.getItem(AI_CHATBOT_STORAGE_KEY) ?? "";
    const preferred =
      chatbotList.items.find((item) => item.id === (chatbotId || selectedChatbotId || stored)) ??
      chatbotList.items[0] ??
      null;
    if (!preferred) {
      setSelectedChatbotId("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [chatbot, answerSettings, guardrailResponse, escalationResponse] = await Promise.all([
        getAdminChatbot(preferred.id),
        getAnswerSettings(preferred.id),
        getGuardrails(preferred.id),
        listEscalationRules(preferred.id),
      ]);
      const escalationPolicy = chatbot.escalationPolicy ?? {};
      const nextForm: ConditionalForm = {
        insufficientEvidenceMode: deriveInsufficientMode(answerSettings.settings),
        afterHoursMode: deriveAfterHoursMode(chatbot),
        disallowLegalJudgment: answerSettings.settings.answerPolicy.disallowLegalJudgment,
        disallowBenefitConfirmation: answerSettings.settings.answerPolicy.disallowDefinitiveClaims,
        disallowOutcomePrediction: answerSettings.settings.answerPolicy.disallowOutcomePrediction,
        escalationMessage: answerSettings.settings.escalationOperating.escalationFallbackMessage ?? "",
        showDepartment: Boolean(escalationPolicy.showDepartment ?? true),
        showContactChannel: Boolean(escalationPolicy.showContactChannel ?? true),
      };
      setSelectedChatbot(chatbot);
      setServerSettings(answerSettings.settings);
      setGuardrails(guardrailResponse.rules);
      setEscalationRules(escalationResponse.rules);
      setForm(nextForm);
      setSnapshot(nextForm);
      setSelectedChatbotId(preferred.id);
      window.localStorage.setItem(AI_CHATBOT_STORAGE_KEY, preferred.id);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function save() {
    if (!selectedChatbotId || !selectedChatbot || !serverSettings) return;
    setIsSaving(true);
    setError(null);
    try {
      const nextSettings = cloneSettings(serverSettings);
      nextSettings.answerPolicy.disallowAnswerWithoutEvidence = true;
      if (form.insufficientEvidenceMode === "block") {
        nextSettings.answerPolicy.clarificationStrategyMode = "minimal";
        nextSettings.escalationOperating.enableEscalationSuggestion = false;
      } else if (form.insufficientEvidenceMode === "verify") {
        nextSettings.answerPolicy.clarificationStrategyMode = "ask_one_question";
        nextSettings.escalationOperating.enableEscalationSuggestion = false;
      } else {
        nextSettings.answerPolicy.clarificationStrategyMode = "ask_one_question";
        nextSettings.escalationOperating.enableEscalationSuggestion = true;
      }
      nextSettings.escalationOperating.afterHoursBehaviorMode = "show_notice";
      nextSettings.escalationOperating.operatingHoursFallbackMessage = buildAfterHoursMessage(
        form.afterHoursMode,
        String((selectedChatbot.escalationPolicy ?? {}).defaultDepartmentName ?? ""),
        String((selectedChatbot.escalationPolicy ?? {}).representativeContact ?? ""),
      );
      nextSettings.answerPolicy.disallowLegalJudgment = form.disallowLegalJudgment;
      nextSettings.answerPolicy.disallowDefinitiveClaims = form.disallowBenefitConfirmation;
      nextSettings.answerPolicy.disallowOutcomePrediction = form.disallowOutcomePrediction;
      nextSettings.escalationOperating.escalationFallbackMessage = form.escalationMessage.trim();
      await patchAnswerSettings(selectedChatbotId, { settings: nextSettings });

      await patchAdminChatbot(selectedChatbotId, {
        businessHours: {
          ...(selectedChatbot.businessHours ?? {}),
          aiAfterHoursMode: form.afterHoursMode,
        },
        escalationPolicy: {
          ...(selectedChatbot.escalationPolicy ?? {}),
          showDepartment: form.showDepartment,
          showContactChannel: form.showContactChannel,
        },
      });

      await loadPage(selectedChatbotId);
      setToast({ tone: "success", message: TEXT.saveSuccess });
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setIsSaving(false);
    }
  }

  const notice = toast ? (
    <ToastNotice tone={toast.tone} message={toast.message} />
  ) : error ? (
    <ToastNotice tone="error" message={error} />
  ) : null;

  const activeGuardrails = guardrails.filter((rule) => rule.isActive).length;
  const activeEscalations = escalationRules.filter((rule) => rule.isActive).length;

  return (
    <AiSettingsLayout
      activeHref="/admin/ai/conditional"
      title={TEXT.title}
      description={TEXT.description}
      chatbotOptions={chatbots}
      selectedChatbotId={selectedChatbotId}
      selectedChatbotName={selectedChatbot?.name}
      onSelectChatbot={(chatbotId) => {
        setSelectedChatbotId(chatbotId);
        void loadPage(chatbotId);
      }}
      toolbar={
        <>
          <button type="button" onClick={() => void loadPage(selectedChatbotId)} disabled={isLoading || !selectedChatbotId} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {TEXT.reload}
          </button>
          <button type="button" onClick={() => setForm(snapshot)} disabled={!isDirty || isSaving} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {TEXT.cancel}
          </button>
          <button type="button" onClick={() => void save()} disabled={!selectedChatbotId || isSaving || isLoading || !isDirty} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            {isSaving ? TEXT.saving : TEXT.save}
          </button>
        </>
      }
      notice={notice}
    >
      {isLoading ? (
        <PagePanel title={TEXT.loadingTitle} description={TEXT.loadingDesc} />
      ) : !selectedChatbotId ? (
        <PagePanel title={TEXT.emptyTitle} description={TEXT.emptyDesc} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <PagePanel title={TEXT.leftTitle} description={TEXT.leftDesc}>
              <div className="grid gap-6">
                <RadioCardGroup
                  label={TEXT.insufficient}
                  value={form.insufficientEvidenceMode}
                  onChange={(value) => setForm((prev) => ({ ...prev, insufficientEvidenceMode: value as ConditionalForm["insufficientEvidenceMode"] }))}
                  options={[
                    { value: "block", title: "\uB2F5\uBCC0 \uAE08\uC9C0", description: "\uD655\uC778 \uAC00\uB2A5\uD55C \uADFC\uAC70\uAC00 \uC5C6\uC73C\uBA74 \uB2F5\uBCC0 \uB300\uC2E0 \uC81C\uD55C \uC548\uB0B4\uB97C \uC6B0\uC120\uD569\uB2C8\uB2E4." },
                    { value: "verify", title: "\uCD94\uAC00 \uD655\uC778 \uC548\uB0B4", description: "\uCD94\uAC00 \uBB38\uC758 \uB610\uB294 \uD655\uC778\uC774 \uD544\uC694\uD558\uB2E4\uB294 \uC548\uB0B4\uB97C \uC81C\uACF5\uD569\uB2C8\uB2E4." },
                    { value: "escalate", title: "\uC0C1\uB2F4\uC6D0 \uC774\uAD00 \uC548\uB0B4", description: "\uADFC\uAC70 \uBD80\uC871 \uC2DC \uB2F4\uB2F9 \uBD80\uC11C \uC5F0\uACB0 \uC548\uB0B4\uB97C \uD568\uAED8 \uC81C\uACF5\uD569\uB2C8\uB2E4." },
                  ]}
                />
                <RadioCardGroup
                  label={TEXT.afterHours}
                  value={form.afterHoursMode}
                  onChange={(value) => setForm((prev) => ({ ...prev, afterHoursMode: value as ConditionalForm["afterHoursMode"] }))}
                  options={[
                    { value: "basic_notice", title: "\uAE30\uBCF8 \uC548\uB0B4", description: "\uC6B4\uC601\uC2DC\uAC04 \uC678 \uC548\uB0B4 \uBB38\uAD6C\uB97C \uAE30\uBCF8 \uD615\uD0DC\uB85C \uC81C\uACF5\uD569\uB2C8\uB2E4." },
                    { value: "next_hours", title: "\uB2E4\uC74C \uC6B4\uC601\uC2DC\uAC04 \uC548\uB0B4", description: "\uB2E4\uC74C \uC6B4\uC601\uC2DC\uAC04\uC5D0 \uB2E4\uC2DC \uBB38\uC758\uD558\uB3C4\uB85D \uC548\uB0B4\uD569\uB2C8\uB2E4." },
                    { value: "contact_info", title: "\uBB38\uC758\uCC98 \uC548\uB0B4", description: "\uB300\uD45C \uBB38\uC758\uCC98\uB098 \uB2F4\uB2F9 \uBD80\uC11C \uC815\uBCF4\uB97C \uD568\uAED8 \uC548\uB0B4\uD569\uB2C8\uB2E4." },
                  ]}
                />
              </div>
            </PagePanel>

            <PagePanel title={TEXT.sensitiveTitle} description={TEXT.sensitiveDesc}>
              <div className="grid gap-3">
                <ToggleField label={TEXT.legal} description={TEXT.legalDesc} checked={form.disallowLegalJudgment} onChange={(value) => setForm((prev) => ({ ...prev, disallowLegalJudgment: value }))} />
                <ToggleField label={TEXT.benefit} description={TEXT.benefitDesc} checked={form.disallowBenefitConfirmation} onChange={(value) => setForm((prev) => ({ ...prev, disallowBenefitConfirmation: value }))} />
                <ToggleField label={TEXT.outcome} description={TEXT.outcomeDesc} checked={form.disallowOutcomePrediction} onChange={(value) => setForm((prev) => ({ ...prev, disallowOutcomePrediction: value }))} />
              </div>
            </PagePanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <PagePanel title={TEXT.escalateTitle} description={TEXT.escalateDesc}>
              <div className="grid gap-4">
                <TextAreaField label={TEXT.escalationMessage} value={form.escalationMessage} onChange={(value) => setForm((prev) => ({ ...prev, escalationMessage: value }))} rows={4} />
                <ToggleField label={TEXT.showDepartment} description={TEXT.showDepartmentDesc} checked={form.showDepartment} onChange={(value) => setForm((prev) => ({ ...prev, showDepartment: value }))} />
                <ToggleField label={TEXT.showContact} description={TEXT.showContactDesc} checked={form.showContactChannel} onChange={(value) => setForm((prev) => ({ ...prev, showContactChannel: value }))} />
              </div>
            </PagePanel>

            <PagePanel title={TEXT.rulesTitle} description={TEXT.rulesDesc}>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  {TEXT.guardrails}: <strong className="text-slate-900">{activeGuardrails}\uAC74</strong>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  {TEXT.escalations}: <strong className="text-slate-900">{activeEscalations}\uAC74</strong>
                </div>
                <p className="text-xs text-slate-500">{TEXT.rulesHelper}</p>
              </div>
            </PagePanel>
          </div>
        </div>
      )}
    </AiSettingsLayout>
  );
}
