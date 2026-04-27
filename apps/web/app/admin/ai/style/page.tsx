"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AI_CHATBOT_STORAGE_KEY,
  AiSettingsLayout,
  RadioCardGroup,
  ToggleField,
  ToastNotice,
} from "../../../../components/admin/ai-settings-layout";
import { PagePanel } from "../../../../components/ui/page-panel";
import { ApiClientError } from "../../../../lib/api";
import { getAdminChatbot, getAdminChatbots, patchAdminChatbot } from "../../../../lib/api/admin-operations";
import { getAnswerSettings, patchAnswerSettings } from "../../../../lib/api/answer-settings";
import type { AnswerSettings } from "../../../../lib/api/answer-settings-types";
import type { AdminChatbotItem, AdminChatbotResponse } from "../../../../lib/api/admin-operations-types";

type StyleForm = {
  tonePreset: "public" | "friendly" | "concise";
  responseLength: "short" | "medium" | "long";
  citationDisplay: "always" | "bottom" | "folded";
  limitDefinitiveExpression: boolean;
  showFreshnessNotice: boolean;
};

const TEXT = {
  error: "\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
  saveSuccess: "\uB300\uD654 \uC2A4\uD0C0\uC77C \uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  title: "\uB300\uD654 \uC2A4\uD0C0\uC77C \uC124\uC815",
  description:
    "\uC6B4\uC601\uC790\uAC00 \uC774\uD574\uD558\uAE30 \uC26C\uC6B4 \uB9D0\uD22C, \uAE38\uC774, \uCD9C\uCC98 \uD45C\uC2DC \uBC29\uC2DD\uC744 \uC120\uD0DD\uD574 \uC751\uB2F5 \uC2A4\uD0C0\uC77C\uC744 \uC870\uC815\uD569\uB2C8\uB2E4.",
  reload: "\uC11C\uBC84\uC5D0\uC11C \uB2E4\uC2DC \uBD88\uB7EC\uC624\uAE30",
  cancel: "\uCDE8\uC18C",
  save: "\uC800\uC7A5",
  saving: "\uC800\uC7A5 \uC911...",
  loadingTitle: "\uBD88\uB7EC\uC624\uB294 \uC911",
  loadingDesc: "\uD604\uC7AC \uCC57\uBD07\uC758 \uB300\uD654 \uC2A4\uD0C0\uC77C \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uACE0 \uC788\uC2B5\uB2C8\uB2E4.",
  emptyTitle: "\uCC57\uBD07 \uC5C6\uC74C",
  emptyDesc: "\uC774 \uAE30\uAD00\uC5D0 \uC5F0\uACB0\uB41C \uCC57\uBD07\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  topTitle: "\uC751\uB2F5 \uD1A4\uACFC \uAE38\uC774",
  topDesc: "\uAE30\uAD00 \uC131\uACA9\uC5D0 \uB9DE\uB294 \uAE30\uBCF8 \uC751\uB2F5 \uC2A4\uD0C0\uC77C\uC744 \uC120\uD0DD\uD569\uB2C8\uB2E4.",
  citeTitle: "\uCD9C\uCC98 \uD45C\uC2DC \uBC29\uC2DD",
  citeDesc:
    "\uD604\uC7AC \uB7F0\uD0C0\uC784\uC774 \uC9C0\uC6D0\uD558\uB294 \uBC94\uC704 \uC548\uC5D0\uC11C \uC6B4\uC601\uC790 \uCE5C\uD654\uC801\uC778 \uD45C\uD604\uC73C\uB85C \uC81C\uACF5\uD569\uB2C8\uB2E4.",
  cautionTitle: "\uC8FC\uC758 \uD45C\uD604",
  cautionDesc: "\uC6B4\uC601\uC0C1 \uBBFC\uAC10\uD55C \uD45C\uD604\uC744 \uAE30\uBCF8 \uC751\uB2F5 \uD1A4\uC5D0\uC11C \uC81C\uC5B4\uD569\uB2C8\uB2E4.",
  tone: "\uB9D0\uD22C \uC120\uD0DD",
  length: "\uC751\uB2F5 \uAE38\uC774",
  citation: "\uCD9C\uCC98 \uD45C\uC2DC \uBC29\uC2DD",
  limit: "\uD655\uC815 \uD45C\uD604 \uC81C\uD55C",
  limitDesc:
    "\uC9C0\uC6D0 \uB300\uC0C1 \uD655\uC815, \uACB0\uACFC \uBCF4\uC7A5\uCC98\uB7FC \uB2E8\uC815\uC801\uC778 \uD45C\uD604\uC744 \uAE30\uBCF8\uC801\uC73C\uB85C \uC81C\uD55C\uD569\uB2C8\uB2E4.",
  freshness: "\uCD5C\uC2E0\uC131 \uC8FC\uC758\uBB38 \uD45C\uC2DC",
  freshnessDesc:
    "\uCD5C\uC2E0 \uACF5\uACE0\uB098 \uBCC0\uACBD \uAC00\uB2A5\uC131\uC774 \uC788\uB294 \uC815\uBCF4\uC5D0\uB294 \uD655\uC778 \uC548\uB0B4 \uBB38\uAD6C\uB97C \uC6B0\uC120 \uD45C\uC2DC\uD569\uB2C8\uB2E4.",
} as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return TEXT.error;
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

export default function AdminAiStylePage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [selectedChatbot, setSelectedChatbot] = useState<AdminChatbotResponse | null>(null);
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [form, setForm] = useState<StyleForm>({
    tonePreset: "public",
    responseLength: "medium",
    citationDisplay: "always",
    limitDefinitiveExpression: true,
    showFreshnessNotice: true,
  });
  const [snapshot, setSnapshot] = useState<StyleForm>({
    tonePreset: "public",
    responseLength: "medium",
    citationDisplay: "always",
    limitDefinitiveExpression: true,
    showFreshnessNotice: true,
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
      const [chatbot, answerSettings] = await Promise.all([
        getAdminChatbot(preferred.id),
        getAnswerSettings(preferred.id),
      ]);
      const nextForm: StyleForm = {
        tonePreset: deriveTonePreset(chatbot, answerSettings.settings),
        responseLength: chatbot.answerLength as StyleForm["responseLength"],
        citationDisplay: deriveCitationDisplay(chatbot, answerSettings.settings),
        limitDefinitiveExpression: answerSettings.settings.answerPolicy.disallowDefinitiveClaims,
        showFreshnessNotice: answerSettings.settings.answerPolicy.requireLatestSourceCheckWarningWhenRelevant,
      };
      setSelectedChatbot(chatbot);
      setServerSettings(answerSettings.settings);
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
      const toneMode =
        form.tonePreset === "public" ? "formal" : form.tonePreset === "concise" ? "plain" : "polite";
      const citationDisplayMode = form.citationDisplay === "folded" ? "compact" : "visible";

      await patchAdminChatbot(selectedChatbotId, {
        tone: toneMode,
        answerLength: form.responseLength,
        citationMode: citationDisplayMode,
        theme: {
          ...(selectedChatbot.theme ?? {}),
          aiTonePreset: form.tonePreset,
          aiCitationPresentation: form.citationDisplay,
        },
      });

      const nextSettings = cloneSettings(serverSettings);
      nextSettings.promptInstruction.toneMode = toneMode;
      nextSettings.answerFormat.maxAnswerLengthMode = form.responseLength;
      nextSettings.answerFormat.citationDisplayMode = citationDisplayMode;
      nextSettings.answerPolicy.disallowDefinitiveClaims = form.limitDefinitiveExpression;
      nextSettings.answerPolicy.requireLatestSourceCheckWarningWhenRelevant = form.showFreshnessNotice;
      await patchAnswerSettings(selectedChatbotId, { settings: nextSettings });

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

  return (
    <AiSettingsLayout
      activeHref="/admin/ai/style"
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
          <PagePanel title={TEXT.topTitle} description={TEXT.topDesc}>
            <div className="grid gap-6">
              <RadioCardGroup
                label={TEXT.tone}
                value={form.tonePreset}
                onChange={(value) => setForm((prev) => ({ ...prev, tonePreset: value as StyleForm["tonePreset"] }))}
                options={[
                  { value: "public", title: "\uACF5\uACF5\uAE30\uAD00\uD615", description: "\uACA9\uC2DD \uC788\uACE0 \uB2E8\uC815\uD55C \uC548\uB0B4 \uC911\uC2EC \uD45C\uD604\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4." },
                  { value: "friendly", title: "\uCE5C\uC808\uD55C \uC0C1\uB2F4\uD615", description: "\uBD80\uB4DC\uB7FD\uACE0 \uC124\uBA85\uC801\uC778 \uC0C1\uB2F4\uD615 \uC548\uB0B4\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4." },
                  { value: "concise", title: "\uAC04\uACB0\uD55C \uC548\uB0B4\uD615", description: "\uD575\uC2EC \uC704\uC8FC\uB85C \uC9E7\uACE0 \uBE60\uB974\uAC8C \uB2F5\uBCC0\uD569\uB2C8\uB2E4." },
                ]}
              />
              <RadioCardGroup
                label={TEXT.length}
                value={form.responseLength}
                onChange={(value) => setForm((prev) => ({ ...prev, responseLength: value as StyleForm["responseLength"] }))}
                options={[
                  { value: "short", title: "\uC9E7\uAC8C", description: "\uD575\uC2EC \uB2F5\uBCC0\uB9CC \uBE60\uB974\uAC8C \uC81C\uACF5\uD569\uB2C8\uB2E4." },
                  { value: "medium", title: "\uBCF4\uD1B5", description: "\uC77C\uBC18 \uC6B4\uC601 \uD658\uACBD\uC5D0 \uB9DE\uB294 \uAE30\uBCF8 \uAE38\uC774\uC785\uB2C8\uB2E4." },
                  { value: "long", title: "\uC790\uC138\uD788", description: "\uC774\uC720\uC640 \uC8FC\uC758\uC0AC\uD56D\uAE4C\uC9C0 \uBE44\uAD50\uC801 \uC790\uC138\uD788 \uC81C\uACF5\uD569\uB2C8\uB2E4." },
                ]}
              />
            </div>
          </PagePanel>

          <div className="grid gap-6 xl:grid-cols-2">
            <PagePanel title={TEXT.citeTitle} description={TEXT.citeDesc}>
              <RadioCardGroup
                label={TEXT.citation}
                value={form.citationDisplay}
                onChange={(value) => setForm((prev) => ({ ...prev, citationDisplay: value as StyleForm["citationDisplay"] }))}
                options={[
                  { value: "always", title: "\uD56D\uC0C1 \uD45C\uC2DC", description: "\uB2F5\uBCC0\uACFC \uD568\uAED8 \uCD9C\uCC98\uB97C \uBC14\uB85C \uBCF4\uC5EC\uC90D\uB2C8\uB2E4." },
                  { value: "bottom", title: "\uB2F5\uBCC0 \uD558\uB2E8 \uD45C\uC2DC", description: "\uB2F5\uBCC0 \uBCF8\uBB38 \uB4A4\uC5D0 \uCD9C\uCC98\uB97C \uC815\uB9AC\uD574 \uBCF4\uC5EC\uC90D\uB2C8\uB2E4." },
                  { value: "folded", title: "\uC811\uAE30 \uD615\uD0DC \uD45C\uC2DC", description: "\uD604\uC7AC \uAD6C\uC870\uC5D0\uC11C\uB294 \uC694\uC57D\uD615 \uCD9C\uCC98 \uD45C\uC2DC\uB85C \uB9E4\uD551\uB429\uB2C8\uB2E4." },
                ]}
              />
            </PagePanel>

            <PagePanel title={TEXT.cautionTitle} description={TEXT.cautionDesc}>
              <div className="grid gap-3">
                <ToggleField label={TEXT.limit} description={TEXT.limitDesc} checked={form.limitDefinitiveExpression} onChange={(value) => setForm((prev) => ({ ...prev, limitDefinitiveExpression: value }))} />
                <ToggleField label={TEXT.freshness} description={TEXT.freshnessDesc} checked={form.showFreshnessNotice} onChange={(value) => setForm((prev) => ({ ...prev, showFreshnessNotice: value }))} />
              </div>
            </PagePanel>
          </div>
        </div>
      )}
    </AiSettingsLayout>
  );
}
