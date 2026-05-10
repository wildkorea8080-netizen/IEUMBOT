"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AI_CHATBOT_STORAGE_KEY,
  AiSettingsLayout,
  ToastNotice,
} from "../../../../components/admin/ai-settings-layout";
import { PagePanel } from "../../../../components/ui/page-panel";
import { ApiClientError } from "../../../../lib/api";
import { getAdminChatbots } from "../../../../lib/api/admin-operations";
import { getAnswerSettings, patchAnswerSettings } from "../../../../lib/api/answer-settings";
import type { AnswerSettings, RagSettings } from "../../../../lib/api/answer-settings-types";
import type { AdminChatbotItem } from "../../../../lib/api/admin-operations-types";

const DEFAULT_RAG: RagSettings = {
  topK: 5,
  retrievalThresholdDocument: 0.28,
  retrievalThresholdWebsite: 0.25,
  retrievalThresholdFaq: 0.22,
  chunkSize: 900,
  chunkOverlap: 120,
  crawlDelayMin: 0.5,
  crawlDelayMax: 1.5,
  crawlMaxConsecutiveFailures: 5,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "요청 처리 중 오류가 발생했습니다.";
}

function cloneSettings(settings: AnswerSettings): AnswerSettings {
  return JSON.parse(JSON.stringify(settings)) as AnswerSettings;
}

function normalizeRag(value?: Partial<RagSettings> | null): RagSettings {
  return { ...DEFAULT_RAG, ...(value ?? {}) };
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  helper?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="block font-medium text-slate-900">{props.label}</span>
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      {props.helper ? <span className="mt-1 block text-xs text-slate-500">{props.helper}</span> : null}
    </label>
  );
}

export default function AdminAiRagPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [selectedChatbotName, setSelectedChatbotName] = useState("");
  const [serverSettings, setServerSettings] = useState<AnswerSettings | null>(null);
  const [form, setForm] = useState<RagSettings>(DEFAULT_RAG);
  const [snapshot, setSnapshot] = useState<RagSettings>(DEFAULT_RAG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(snapshot), [form, snapshot]);

  function updateField<K extends keyof RagSettings>(key: K, value: RagSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      setSelectedChatbotName("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const answerSettings = await getAnswerSettings(preferred.id);
      const nextForm = normalizeRag(answerSettings.settings.rag);
      setServerSettings(answerSettings.settings);
      setForm(nextForm);
      setSnapshot(nextForm);
      setSelectedChatbotId(preferred.id);
      setSelectedChatbotName(preferred.name);
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
    if (!selectedChatbotId || !serverSettings) return;
    setIsSaving(true);
    setError(null);
    try {
      const nextSettings = cloneSettings(serverSettings);
      nextSettings.rag = normalizeRag(form);
      await patchAnswerSettings(selectedChatbotId, { settings: nextSettings });
      await loadPage(selectedChatbotId);
      setToast({ tone: "success", message: "RAG 설정이 저장되었습니다" });
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
      activeHref="/admin/ai/rag"
      title="RAG 검색 설정"
      description="검색 후보, 임계값, 청킹, 웹 크롤링 파라미터를 챗봇별로 조정합니다."
      chatbotOptions={chatbots}
      selectedChatbotId={selectedChatbotId}
      selectedChatbotName={selectedChatbotName}
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
            서버에서 다시 불러오기
          </button>
          <button
            type="button"
            onClick={() => setForm(snapshot)}
            disabled={!isDirty || isSaving}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!selectedChatbotId || isSaving || isLoading || !isDirty}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </>
      }
      notice={notice}
    >
      {isLoading ? (
        <PagePanel title="불러오는 중" description="현재 챗봇의 RAG 설정을 불러오고 있습니다." />
      ) : !selectedChatbotId ? (
        <PagePanel title="챗봇 없음" description="이 기관에 연결된 챗봇이 없습니다." />
      ) : (
        <div className="space-y-6">
          <PagePanel title="검색 설정" description="검색 후보 수와 출처 유형별 검색 임계값을 조정합니다.">
            <div className="grid gap-5">
              <label className="block text-sm text-slate-700">
                <span className="block font-medium text-slate-900">참조 청크 수 (Top-K)</span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={form.topK}
                  onChange={(event) => updateField("topK", Number(event.target.value))}
                  className="mt-3 w-full"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  현재값: {form.topK}. 값이 클수록 더 많은 문서를 참고합니다.
                </span>
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <NumberField
                  label="문서 임계값"
                  value={form.retrievalThresholdDocument}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateField("retrievalThresholdDocument", value)}
                />
                <NumberField
                  label="웹사이트 임계값"
                  value={form.retrievalThresholdWebsite}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateField("retrievalThresholdWebsite", value)}
                />
                <NumberField
                  label="FAQ 임계값"
                  value={form.retrievalThresholdFaq}
                  min={0}
                  max={1}
                  step={0.01}
                  helper="값이 낮을수록 더 많은 청크가 검색됩니다."
                  onChange={(value) => updateField("retrievalThresholdFaq", value)}
                />
              </div>
            </div>
          </PagePanel>

          <PagePanel title="문서 청킹 설정" description="청크가 작을수록 정밀하고, 클수록 맥락이 풍부해집니다.">
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField
                label="청크 크기 (자)"
                value={form.chunkSize}
                min={200}
                max={2000}
                onChange={(value) => updateField("chunkSize", value)}
              />
              <NumberField
                label="오버랩 크기 (자)"
                value={form.chunkOverlap}
                min={0}
                max={500}
                onChange={(value) => updateField("chunkOverlap", value)}
              />
            </div>
          </PagePanel>

          <PagePanel title="웹 크롤링 설정" description="웹사이트 수집 시 요청 간격과 실패 허용 범위를 조정합니다.">
            <div className="grid gap-4 md:grid-cols-3">
              <NumberField
                label="요청 간격 최소 (초)"
                value={form.crawlDelayMin}
                min={0}
                max={5}
                step={0.1}
                onChange={(value) => updateField("crawlDelayMin", value)}
              />
              <NumberField
                label="요청 간격 최대 (초)"
                value={form.crawlDelayMax}
                min={0}
                max={10}
                step={0.1}
                onChange={(value) => updateField("crawlDelayMax", value)}
              />
              <NumberField
                label="연속 실패 허용 횟수"
                value={form.crawlMaxConsecutiveFailures}
                min={1}
                max={20}
                onChange={(value) => updateField("crawlMaxConsecutiveFailures", value)}
              />
            </div>
          </PagePanel>
        </div>
      )}
    </AiSettingsLayout>
  );
}
