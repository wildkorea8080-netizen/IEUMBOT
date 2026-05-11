"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot, MessageCircle, Share2,
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
  patchAdminChatbot,
} from "../../../../lib/api/admin-operations";
import { getAnswerSettings, patchAnswerSettings } from "../../../../lib/api/answer-settings";
import type { AnswerSettings } from "../../../../lib/api/answer-settings-types";
import type {
  AdminChatbotItem,
  AdminChatbotResponse,
} from "../../../../lib/api/admin-operations-types";

// ── 타입 / 유틸 ──────────────────────────────────────────

type BasicForm = {
  chatbotName: string;
  defaultGuideMessage: string;
  operatingHoursMessage: string;
  fallbackMessage: string;
  departmentName: string;
  contactPhone: string;
};

function emptyForm(): BasicForm {
  return { chatbotName: "", defaultGuideMessage: "", operatingHoursMessage: "", fallbackMessage: "", departmentName: "", contactPhone: "" };
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
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [form, setForm] = useState<BasicForm>(emptyForm);
  const [snapshot, setSnapshot] = useState<BasicForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);

  function update<K extends keyof BasicForm>(key: K, value: BasicForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function loadPage(chatbotId?: string) {
    const chatbotList = await getAdminChatbots();
    setChatbots(chatbotList.items);
    const stored = window.localStorage.getItem(AI_CHATBOT_STORAGE_KEY) ?? "";
    const preferred = chatbotList.items.find(it => it.id === (chatbotId || selectedChatbotId || stored)) ?? chatbotList.items[0] ?? null;
    if (!preferred) { setSelectedChatbotId(""); setIsLoading(false); return; }

    setIsLoading(true); setError(null);
    try {
      const [chatbot, settings] = await Promise.all([
        getAdminChatbot(preferred.id),
        getAnswerSettings(preferred.id),
      ]);
      const escalationPolicy = chatbot.escalationPolicy ?? {};
      const nextForm: BasicForm = {
        chatbotName: chatbot.name ?? "",
        defaultGuideMessage: chatbot.descriptionText ?? "",
        operatingHoursMessage: settings.settings.escalationOperating.operatingHoursFallbackMessage ?? "",
        fallbackMessage: chatbot.fallbackMessage ?? settings.settings.answerPolicy.fallbackMessageWhenInsufficientEvidence ?? "",
        departmentName: String(escalationPolicy.defaultDepartmentName ?? ""),
        contactPhone: String(escalationPolicy.representativeContact ?? ""),
      };
      setSelectedChatbot(chatbot);
      setServerSettings(settings.settings);
      setForm(nextForm);
      setSnapshot(nextForm);
      setSelectedChatbotId(preferred.id);
      window.localStorage.setItem(AI_CHATBOT_STORAGE_KEY, preferred.id);
    } catch (e) { setError(getErrorMessage(e)); } finally { setIsLoading(false); }
  }

  useEffect(() => { void loadPage(); }, []);

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
        fallbackMessage: form.fallbackMessage.trim(),
        descriptionText: form.defaultGuideMessage.trim(),
        escalationPolicy: { ...(selectedChatbot.escalationPolicy ?? {}), defaultDepartmentName: form.departmentName.trim(), representativeContact: form.contactPhone.trim() },
      });
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
            <div className="grid grid-cols-1 gap-4">
              <TextInputField label="챗봇 이름" value={form.chatbotName} onChange={v => update("chatbotName", v)} placeholder="예: 해외농업길잡이" />
              <TextAreaField
                label="챗봇 설명"
                value={form.defaultGuideMessage}
                onChange={v => update("defaultGuideMessage", v)}
                rows={3}
                placeholder="챗봇의 목적과 안내 범위를 입력하세요"
                helper="위젯 첫 화면 문구, 환영 메시지, 추천 질문은 위젯 설정에서 관리합니다."
              />
            </div>
          </SectionCard>

          {/* 섹션 2: 응답 정책 메시지 */}
          <SectionCard title="응답 정책 메시지" icon={<MessageCircle style={{ width: 18, height: 18 }} />}>
            <div className="grid grid-cols-1 gap-4">
              <TextAreaField label="운영시간 외 메시지" value={form.operatingHoursMessage} onChange={v => update("operatingHoursMessage", v)} rows={3} placeholder="현재 운영시간이 아닙니다. 운영시간에 다시 문의해 주세요." />
              <TextAreaField label="폴백 메시지" value={form.fallbackMessage} onChange={v => update("fallbackMessage", v)} rows={3} placeholder="답을 찾지 못했을 때 표시할 메시지" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextInputField label="담당 부서명" value={form.departmentName} onChange={v => update("departmentName", v)} placeholder="예: 고객지원팀" />
                <TextInputField label="대표 문의 연락처" value={form.contactPhone} onChange={v => update("contactPhone", v)} placeholder="예: 02-1234-5678" />
              </div>
            </div>
          </SectionCard>

          {/* 섹션 3: 채널 공유 링크 */}
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
