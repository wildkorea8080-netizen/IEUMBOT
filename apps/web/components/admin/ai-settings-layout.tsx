"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { writeSelectedAdminChatbot } from "../../lib/admin-ui/selected-chatbot";
import { PagePanel } from "../ui/page-panel";

export const AI_CHATBOT_STORAGE_KEY = "ieumbot_admin_ai_chatbot_id";

const AI_TABS = [
  { href: "/admin/ai/basic", label: "기본 설정" },
  { href: "/admin/ai/style", label: "대화 스타일" },
  { href: "/admin/ai/conditional", label: "조건별 설정" },
] as const;

type ChatbotOption = {
  id: string;
  name: string;
  status: string;
};

type AiSettingsLayoutProps = {
  activeHref: string;
  title: string;
  description: string;
  chatbotOptions: ChatbotOption[];
  selectedChatbotId: string;
  selectedChatbotName?: string;
  onSelectChatbot: (chatbotId: string) => void;
  toolbar?: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
};

export function AiSettingsLayout({
  activeHref,
  title,
  description,
  chatbotOptions,
  selectedChatbotId,
  selectedChatbotName,
  onSelectChatbot,
  toolbar,
  notice,
  children,
}: AiSettingsLayoutProps) {
  useEffect(() => {
    if (!selectedChatbotId || !selectedChatbotName) return;
    window.localStorage.setItem(AI_CHATBOT_STORAGE_KEY, selectedChatbotId);
    writeSelectedAdminChatbot({ id: selectedChatbotId, name: selectedChatbotName });
  }, [selectedChatbotId, selectedChatbotName]);

  return (
    <div className="space-y-6">
      <PagePanel title={title} description={description}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              현재 챗봇: <strong className="text-slate-900">{selectedChatbotName ?? "-"}</strong>
            </div>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">챗봇 선택</span>
              <select
                value={selectedChatbotId}
                onChange={(event) => onSelectChatbot(event.target.value)}
                className="w-full min-w-[260px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {chatbotOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.status})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/answer-settings"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              고급 답변 설정
            </Link>
            <Link
              href="/admin/guardrails"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              고급 가드레일
            </Link>
            {toolbar}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {AI_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                activeHref === tab.href
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </PagePanel>

      {notice}

      {children}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="block font-medium text-slate-900">{children}</span>;
}

export function TextInputField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <FieldLabel>{props.label}</FieldLabel>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      {props.helper ? <span className="mt-1 block text-xs text-slate-500">{props.helper}</span> : null}
    </label>
  );
}

export function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <FieldLabel>{props.label}</FieldLabel>
      <textarea
        rows={props.rows ?? 4}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      {props.helper ? <span className="mt-1 block text-xs text-slate-500">{props.helper}</span> : null}
    </label>
  );
}

export function ToggleField(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
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

export function RadioCardGroup(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; title: string; description: string }>;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{props.label}</FieldLabel>
      <div className="grid gap-3 md:grid-cols-3">
        {props.options.map((option) => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-xl border p-4 text-sm ${
              props.value === option.value ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"
            }`}
          >
            <input
              type="radio"
              name={props.label}
              value={option.value}
              checked={props.value === option.value}
              onChange={(event) => props.onChange(event.target.value)}
              className="sr-only"
            />
            <div className="font-medium text-slate-900">{option.title}</div>
            <div className="mt-1 text-xs text-slate-600">{option.description}</div>
          </label>
        ))}
      </div>
    </div>
  );
}

export function ToastNotice(props: { tone: "success" | "error"; message: string }) {
  const className =
    props.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{props.message}</div>;
}
