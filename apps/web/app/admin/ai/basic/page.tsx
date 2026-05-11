"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot, Lightbulb, MessageCircle, Share2,
  Plus, X,
} from "lucide-react";

import {
  AI_CHATBOT_STORAGE_KEY,
  AiSettingsLayout,
  SectionCard,
  TextInputField,
  TextAreaField,
  SaveButton,
  ToastNotice,
} from "../../../../components/admin/ai-settings-layout";
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

// ── 타입 / 유틸 ──────────────────────────────────────────

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

function emptyForm(): BasicForm {
  return { chatbotName: "", widgetDisplayName: "", welcomeMessage: "", quickReplyHints: [], defaultGuideMessage: "", operatingHoursMessage: "", fallbackMessage: "", departmentName: "", contactPhone: "" };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "요청 처리 중 오류가 발생했습니다.";
}

function cloneSettings(settings: AnswerSettings): AnswerSettings {
  return JSON.parse(JSON.stringify(settings)) as AnswerSettings;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────

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
  const [copied, setCopied] = useState(false);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);

  function update<K extends keyof BasicForm>(key: K, value: BasicForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function addHint() {
    const hint = quickHintInput.trim();
    if (!hint) return;
    if (hint.length > 40) { setToast({ tone: "error", message: "질문 힌트는 40자 이내로 입력해 주세요." }); return; }
    if (form.quickReplyHints.length >= 5) { setToast({ tone: "error", message: "질문 힌트는 최대 5개까지 등록할 수 있습니다." }); return; }
    if (form.quickReplyHints.includes(hint)) { setToast({ tone: "error", message: "이미 등록된 질문 힌트입니다." }); return; }
    update("quickReplyHints", [...form.quickReplyHints, hint]);
    setQuickHintInput("");
  }

  function removeHint(i: number) {
    update("quickReplyHints", form.quickReplyHints.filter((_, idx) => idx !== i));
  }

  async function loadPage(chatbotId?: string) {
    const chatbotList = await getAdminChatbots();
    setChatbots(chatbotList.items);
    const stored = window.localStorage.getItem(AI_CHATBOT_STORAGE_KEY) ?? "";
    const preferred = chatbotList.items.find(it => it.id === (chatbotId || selectedChatbotId || stored)) ?? chatbotList.items[0] ?? null;
    if (!preferred) { setSelectedChatbotId(""); setIsLoading(false); return; }

    setIsLoading(true); setError(null);
    try {
      const [chatbot, widget, settings] = await Promise.all([
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
        operatingHoursMessage: settings.settings.escalationOperating.operatingHoursFallbackMessage ?? "",
        fallbackMessage: chatbot.fallbackMessage ?? settings.settings.answerPolicy.fallbackMessageWhenInsufficientEvidence ?? "",
        departmentName: String(escalationPolicy.defaultDepartmentName ?? ""),
        contactPhone: String(escalationPolicy.representativeContact ?? ""),
      };
      setSelectedChatbot(chatbot);
      setSelectedWidget(widget);
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
      await patchAdminChatbot(selectedChatbotId, {
        name: form.chatbotName.trim(),
        welcomeMessage: form.welcomeMessage.trim(),
        quickReplyHints: form.quickReplyHints.map(h => h.trim()).filter(Boolean).slice(0, 5),
        fallbackMessage: form.fallbackMessage.trim(),
        descriptionText: form.defaultGuideMessage.trim(),
        escalationPolicy: { ...(selectedChatbot.escalationPolicy ?? {}), defaultDepartmentName: form.departmentName.trim(), representativeContact: form.contactPhone.trim() },
      });
      if (selectedWidget) await patchAdminWidget(selectedChatbotId, { launcherLabel: form.widgetDisplayName.trim() });
      const next = cloneSettings(serverSettings);
      next.answerPolicy.fallbackMessageWhenInsufficientEvidence = form.fallbackMessage.trim();
      next.escalationOperating.operatingHoursFallbackMessage = form.operatingHoursMessage.trim();
      await patchAnswerSettings(selectedChatbotId, { settings: next });
      await loadPage(selectedChatbotId);
      setToast({ tone: "success", message: "AI 기본설정이 저장되었습니다." });
    } catch (e) {
      const msg = getErrorMessage(e);
      setError(msg);
      setToast({ tone: "error", message: msg });
    } finally { setIsSaving(false); }
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/chat/${selectedChatbotId}` : "";

  return (
    <AiSettingsLayout
      activeHref="/admin/ai/basic"
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
          {/* 섹션 1: 챗봇 기본 정보 */}
          <SectionCard title="챗봇 기본 정보" icon={<Bot style={{ width: 18, height: 18 }} />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInputField label="챗봇 이름" value={form.chatbotName} onChange={v => update("chatbotName", v)} placeholder="예: 해외농업길잡이" />
              <TextInputField
                label="위젯 표시 이름"
                value={form.widgetDisplayName}
                onChange={v => update("widgetDisplayName", v)}
                placeholder="예: AI 상담봇"
                helper={selectedWidget ? "위젯이 있는 경우에만 저장됩니다." : "현재 연결된 위젯이 없어 저장되지 않습니다."}
              />
              <div className="md:col-span-2">
                <TextAreaField label="환영 메시지" value={form.welcomeMessage} onChange={v => update("welcomeMessage", v)} rows={3} placeholder="안녕하세요! 무엇을 도와드릴까요?" />
              </div>
            </div>
          </SectionCard>

          {/* 섹션 2: AI 질문 힌트 */}
          <SectionCard
            title="AI 질문 힌트"
            description="채팅 시작 시 사용자에게 제안할 질문 버튼입니다 (최대 5개, 각 40자 이내)"
            icon={<Lightbulb style={{ width: 18, height: 18 }} />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {form.quickReplyHints.length === 0 ? (
                <div style={{ border: "2px dashed #e2e8f0", borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
                  등록된 질문 힌트가 없습니다
                </div>
              ) : (
                form.quickReplyHints.map((hint, i) => (
                  <div key={`${hint}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px" }}>
                    <span style={{ flex: 1, fontSize: 14, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</span>
                    <button type="button" onClick={() => removeHint(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2, display: "flex" }}>
                      <X style={{ width: 15, height: 15 }} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {form.quickReplyHints.length < 5 ? (
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    value={quickHintInput}
                    onChange={e => setQuickHintInput(e.target.value.slice(0, 40))}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addHint(); } }}
                    placeholder="예: 신청 방법이 어떻게 되나요?"
                    className="input-field"
                  />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#94a3b8" }}>{quickHintInput.length}/40</span>
                </div>
                <button type="button" onClick={addHint} disabled={!quickHintInput.trim()} className="btn-primary flex items-center gap-1.5" style={{ padding: "0 16px", height: 40 }}>
                  <Plus style={{ width: 15, height: 15 }} />힌트 추가
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "#d97706", textAlign: "center" }}>최대 5개까지 추가 가능합니다</p>
            )}
          </SectionCard>

          {/* 섹션 3: 안내 메시지 */}
          <SectionCard title="안내 메시지" icon={<MessageCircle style={{ width: 18, height: 18 }} />}>
            <div className="grid grid-cols-1 gap-4">
              <TextAreaField label="기본 안내문" value={form.defaultGuideMessage} onChange={v => update("defaultGuideMessage", v)} rows={3} placeholder="챗봇 소개나 기관 안내 문구를 입력하세요" />
              <TextAreaField label="운영시간 외 메시지" value={form.operatingHoursMessage} onChange={v => update("operatingHoursMessage", v)} rows={3} placeholder="현재 운영시간이 아닙니다. 운영시간에 다시 문의해 주세요." />
              <TextAreaField label="폴백 메시지" value={form.fallbackMessage} onChange={v => update("fallbackMessage", v)} rows={3} placeholder="답을 찾지 못했을 때 표시할 메시지" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextInputField label="담당 부서명" value={form.departmentName} onChange={v => update("departmentName", v)} placeholder="예: 고객지원팀" />
                <TextInputField label="대표 문의 연락처" value={form.contactPhone} onChange={v => update("contactPhone", v)} placeholder="예: 02-1234-5678" />
              </div>
            </div>
          </SectionCard>

          {/* 섹션 4: 채널 공유 링크 */}
          {selectedChatbotId && (
            <SectionCard title="채널 공유 링크" description="이 링크로 챗봇을 위젯 없이 직접 공유할 수 있습니다" icon={<Share2 style={{ width: 18, height: 18 }} />}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input readOnly value={shareUrl} className="input-field" style={{ flex: 1 }} />
                <button type="button" onClick={() => { void navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn-secondary" style={{ whiteSpace: "nowrap" }}>
                  {copied ? "복사됨!" : "링크 복사"}
                </button>
                <button type="button" onClick={() => window.open(`/chat/${selectedChatbotId}`, "_blank")} className="btn-secondary" style={{ whiteSpace: "nowrap" }}>
                  미리보기
                </button>
              </div>
            </SectionCard>
          )}

          <SaveButton onClick={() => void save()} disabled={!isDirty || isSaving || isLoading || !selectedChatbotId} isSaving={isSaving} />
        </>
      )}
    </AiSettingsLayout>
  );
}
