"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AI_CHATBOT_STORAGE_KEY,
  AiSettingsLayout,
  TextAreaField,
  TextInputField,
  ToastNotice,
} from "../../../../components/admin/ai-settings-layout";
import { PagePanel } from "../../../../components/ui/page-panel";
import { ApiClientError } from "../../../../lib/api";
import {
  getAdminChatbot,
  getAdminChatbots,
  getAdminWidget,
  patchAdminChatbot,
  patchAdminWidget,
} from "../../../../lib/api/admin-operations";
import { getAnswerSettings, patchAnswerSettings } from "../../../../lib/api/answer-settings";
import type { AnswerSettings } from "../../../../lib/api/answer-settings-types";
import type {
  AdminChatbotItem,
  AdminChatbotResponse,
  AdminWidgetResponse,
} from "../../../../lib/api/admin-operations-types";

type BasicForm = {
  chatbotName: string;
  widgetDisplayName: string;
  welcomeMessage: string;
  quickReplyHints: string[];
  defaultGuideMessage: string;
  operatingHoursMessage: string;
  fallbackMessage: string;
  departmentName: string;
  contactPhone: string;
};

const TEXT = {
  error: "\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
  saveSuccess: "AI \uAE30\uBCF8\uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  title: "AI \uAE30\uBCF8\uC124\uC815",
  description:
    "\uAE30\uAD00\uAD00\uB9AC\uC790\uAC00 \uC790\uC8FC \uC218\uC815\uD558\uB294 \uCC57\uBD07 \uAE30\uBCF8 \uBB38\uAD6C\uC640 \uC5F0\uB77D \uC815\uBCF4\uB97C \uC6B4\uC601 \uD654\uBA74\uC5D0 \uB9DE\uAC8C \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
  reload: "\uC11C\uBC84\uC5D0\uC11C \uB2E4\uC2DC \uBD88\uB7EC\uC624\uAE30",
  cancel: "\uCDE8\uC18C",
  save: "\uC800\uC7A5",
  saving: "\uC800\uC7A5 \uC911...",
  loadingTitle: "\uBD88\uB7EC\uC624\uB294 \uC911",
  loadingDesc: "\uD604\uC7AC \uCC57\uBD07\uC758 AI \uAE30\uBCF8\uC124\uC815\uC744 \uBD88\uB7EC\uC624\uACE0 \uC788\uC2B5\uB2C8\uB2E4.",
  emptyTitle: "\uCC57\uBD07 \uC5C6\uC74C",
  emptyDesc: "\uC774 \uAE30\uAD00\uC5D0 \uC5F0\uACB0\uB41C \uCC57\uBD07\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  leftTitle: "\uAE30\uBCF8 \uC815\uBCF4",
  leftDesc: "\uC6B4\uC601\uC790\uAC00 \uC77C\uBC18 \uD654\uBA74\uC5D0\uC11C \uC790\uC8FC \uC218\uC815\uD558\uB294 \uAE30\uBCF8 \uBB38\uAD6C\uC785\uB2C8\uB2E4.",
  rightTitle: "\uBB38\uC758 \uBC0F \uC608\uC678 \uC548\uB0B4",
  rightDesc:
    "\uADFC\uAC70 \uBD80\uC871\uC774\uB098 \uCD94\uAC00 \uBB38\uC758 \uC0C1\uD669\uC5D0\uC11C \uB178\uCD9C\uD560 \uAE30\uBCF8 \uC815\uBCF4\uB97C \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
  chatbotName: "\uCC57\uBD07 \uC774\uB984",
  widgetName: "\uC704\uC82F \uD45C\uC2DC\uBA85",
  widgetHelperHas: "\uC704\uC82F\uC774 \uC788\uB294 \uACBD\uC6B0\uC5D0\uB9CC \uC800\uC7A5\uB429\uB2C8\uB2E4.",
  widgetHelperNone: "\uD604\uC7AC \uC5F0\uACB0\uB41C \uC704\uC82F\uC774 \uC5C6\uC5B4 \uC800\uC7A5\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  welcome: "\uD658\uC601 \uBA54\uC2DC\uC9C0",
  quickHints: "AI 질문 힌트",
  quickHintsDesc: "채팅 시작 시 사용자에게 제안할 질문 버튼입니다 (최대 5개, 각 40자 이내)",
  quickHintsEmpty: "등록된 질문 힌트가 없습니다",
  quickHintsPlaceholder: "예: 신청 방법이 어떻게 되나요?",
  quickHintsAdd: "추가",
  guide: "\uAE30\uBCF8 \uC548\uB0B4\uBB38",
  operating: "\uC6B4\uC601\uC2DC\uAC04 \uC548\uB0B4\uBB38",
  fallback: "\uAE30\uBCF8 fallback \uBA54\uC2DC\uC9C0",
  department: "\uB2F4\uB2F9 \uBD80\uC11C\uBA85",
  contact: "\uB300\uD45C \uBB38\uC758 \uC5F0\uB77D\uCC98",
} as const;

function emptyForm(): BasicForm {
  return {
    chatbotName: "",
    widgetDisplayName: "",
    welcomeMessage: "",
    quickReplyHints: [],
    defaultGuideMessage: "",
    operatingHoursMessage: "",
    fallbackMessage: "",
    departmentName: "",
    contactPhone: "",
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return TEXT.error;
}

function cloneSettings(settings: AnswerSettings): AnswerSettings {
  return JSON.parse(JSON.stringify(settings)) as AnswerSettings;
}

export default function AdminAiBasicPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [selectedChatbot, setSelectedChatbot] = useState<AdminChatbotResponse | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<AdminWidgetResponse | null>(null);
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [form, setForm] = useState<BasicForm>(emptyForm);
  const [snapshot, setSnapshot] = useState<BasicForm>(emptyForm);
  const [quickHintInput, setQuickHintInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);

  function updateField<K extends keyof BasicForm>(key: K, value: BasicForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addQuickHint() {
    const hint = quickHintInput.trim();
    if (!hint) return;
    if (hint.length > 40) {
      setToast({ tone: "error", message: "질문 힌트는 40자 이내로 입력해 주세요." });
      return;
    }
    if (form.quickReplyHints.length >= 5) {
      setToast({ tone: "error", message: "질문 힌트는 최대 5개까지 등록할 수 있습니다." });
      return;
    }
    if (form.quickReplyHints.includes(hint)) {
      setToast({ tone: "error", message: "이미 등록된 질문 힌트입니다." });
      return;
    }
    updateField("quickReplyHints", [...form.quickReplyHints, hint]);
    setQuickHintInput("");
  }

  function removeQuickHint(index: number) {
    updateField(
      "quickReplyHints",
      form.quickReplyHints.filter((_, itemIndex) => itemIndex !== index),
    );
  }

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
      const [chatbot, widget, answerSettings] = await Promise.all([
        getAdminChatbot(preferred.id),
        getAdminWidget(preferred.id).catch(() => null),
        getAnswerSettings(preferred.id),
      ]);
      const escalationPolicy = chatbot.escalationPolicy ?? {};
      const nextForm: BasicForm = {
        chatbotName: chatbot.name ?? "",
        widgetDisplayName: widget?.launcherLabel ?? "",
        welcomeMessage: chatbot.welcomeMessage ?? "",
        quickReplyHints: chatbot.quickReplyHints ?? [],
        defaultGuideMessage: chatbot.descriptionText ?? "",
        operatingHoursMessage: answerSettings.settings.escalationOperating.operatingHoursFallbackMessage ?? "",
        fallbackMessage:
          chatbot.fallbackMessage ??
          answerSettings.settings.answerPolicy.fallbackMessageWhenInsufficientEvidence ??
          "",
        departmentName: String(escalationPolicy.defaultDepartmentName ?? ""),
        contactPhone: String(escalationPolicy.representativeContact ?? ""),
      };
      setSelectedChatbot(chatbot);
      setSelectedWidget(widget);
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
      await patchAdminChatbot(selectedChatbotId, {
        name: form.chatbotName.trim(),
        welcomeMessage: form.welcomeMessage.trim(),
        quickReplyHints: form.quickReplyHints.map((item) => item.trim()).filter(Boolean).slice(0, 5),
        fallbackMessage: form.fallbackMessage.trim(),
        descriptionText: form.defaultGuideMessage.trim(),
        escalationPolicy: {
          ...(selectedChatbot.escalationPolicy ?? {}),
          defaultDepartmentName: form.departmentName.trim(),
          representativeContact: form.contactPhone.trim(),
        },
      });

      if (selectedWidget) {
        await patchAdminWidget(selectedChatbotId, { launcherLabel: form.widgetDisplayName.trim() });
      }

      const nextSettings = cloneSettings(serverSettings);
      nextSettings.answerPolicy.fallbackMessageWhenInsufficientEvidence = form.fallbackMessage.trim();
      nextSettings.escalationOperating.operatingHoursFallbackMessage = form.operatingHoursMessage.trim();
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
      activeHref="/admin/ai/basic"
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
          <button
            type="button"
            onClick={() => void loadPage(selectedChatbotId)}
            disabled={isLoading || !selectedChatbotId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {TEXT.reload}
          </button>
          <button
            type="button"
            onClick={() => setForm(snapshot)}
            disabled={!isDirty || isSaving}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {TEXT.cancel}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!selectedChatbotId || isSaving || isLoading || !isDirty}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
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
        <div className="grid gap-6 xl:grid-cols-2">
          <PagePanel title={TEXT.leftTitle} description={TEXT.leftDesc}>
            <div className="grid gap-4">
              <TextInputField label={TEXT.chatbotName} value={form.chatbotName} onChange={(value) => updateField("chatbotName", value)} />
              <TextInputField
                label={TEXT.widgetName}
                value={form.widgetDisplayName}
                onChange={(value) => updateField("widgetDisplayName", value)}
                helper={selectedWidget ? TEXT.widgetHelperHas : TEXT.widgetHelperNone}
              />
              <TextAreaField label={TEXT.welcome} value={form.welcomeMessage} onChange={(value) => updateField("welcomeMessage", value)} rows={4} />
              <div className="rounded-md border border-slate-200 p-4">
                <div>
                  <div className="text-sm font-medium text-slate-900">{TEXT.quickHints}</div>
                  <p className="mt-1 text-xs text-slate-500">{TEXT.quickHintsDesc}</p>
                </div>
                <div className="mt-3 grid gap-2">
                  {form.quickReplyHints.length > 0 ? (
                    form.quickReplyHints.map((hint, index) => (
                      <div
                        key={`${hint}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate text-slate-700">{hint}</span>
                        <button
                          type="button"
                          onClick={() => removeQuickHint(index)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white"
                          aria-label="질문 힌트 삭제"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
                      {TEXT.quickHintsEmpty}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      value={quickHintInput}
                      onChange={(event) => setQuickHintInput(event.target.value.slice(0, 40))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addQuickHint();
                        }
                      }}
                      placeholder={TEXT.quickHintsPlaceholder}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="mt-1 text-right text-xs text-slate-500">{quickHintInput.length}/40</div>
                  </div>
                  <button
                    type="button"
                    onClick={addQuickHint}
                    disabled={form.quickReplyHints.length >= 5 || !quickHintInput.trim()}
                    className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {TEXT.quickHintsAdd}
                  </button>
                </div>
              </div>
              <TextAreaField label={TEXT.guide} value={form.defaultGuideMessage} onChange={(value) => updateField("defaultGuideMessage", value)} rows={5} />
              <TextAreaField label={TEXT.operating} value={form.operatingHoursMessage} onChange={(value) => updateField("operatingHoursMessage", value)} rows={4} />
            </div>
          </PagePanel>

          <PagePanel title={TEXT.rightTitle} description={TEXT.rightDesc}>
            <div className="grid gap-4">
              <TextAreaField label={TEXT.fallback} value={form.fallbackMessage} onChange={(value) => updateField("fallbackMessage", value)} rows={4} />
              <TextInputField label={TEXT.department} value={form.departmentName} onChange={(value) => updateField("departmentName", value)} />
              <TextInputField label={TEXT.contact} value={form.contactPhone} onChange={(value) => updateField("contactPhone", value)} />
              {selectedChatbotId && (
                <div style={{ marginTop: 24, padding: "16px 20px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>
                    채널 공유 링크
                  </p>
                  <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
                    이 링크로 챗봇을 위젯 없이 직접 공유할 수 있습니다
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/chat/${selectedChatbotId}`}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                        fontSize: 13,
                        color: "#475569",
                        background: "#fff",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${window.location.origin}/chat/${selectedChatbotId}`,
                        );
                      }}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        fontSize: 13,
                        cursor: "pointer",
                        color: "#475569",
                        whiteSpace: "nowrap",
                      }}
                    >
                      링크 복사
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(`/chat/${selectedChatbotId}`, "_blank")}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        fontSize: 13,
                        cursor: "pointer",
                        color: "#475569",
                        whiteSpace: "nowrap",
                      }}
                    >
                      미리보기
                    </button>
                  </div>
                </div>
              )}
            </div>
          </PagePanel>
        </div>
      )}
    </AiSettingsLayout>
  );
}
