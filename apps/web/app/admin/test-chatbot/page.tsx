"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";
import { runRuntimeChat } from "../../../lib/api/runtime-chat";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message || "응답을 불러오지 못했습니다.";
  }
  if (error instanceof Error) {
    return error.message || "응답을 불러오지 못했습니다.";
  }
  return "응답을 불러오지 못했습니다.";
}

export default function AdminTestChatbotPage() {
  const searchParams = useSearchParams();
  const preferredChatbotId = searchParams.get("chatbotId") ?? "";

  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getAdminChatbots();
        setChatbots(response.items);

        if (response.items.length === 0) {
          setSelectedChatbotId("");
          setError("테스트할 챗봇이 없습니다.");
          return;
        }

        const initialChatbot =
          response.items.find((item) => item.id === preferredChatbotId) ??
          response.items[0];
        setSelectedChatbotId(initialChatbot.id);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [preferredChatbotId]);

  const selectedChatbot = useMemo(
    () => chatbots.find((item) => item.id === selectedChatbotId) ?? null,
    [chatbots, selectedChatbotId],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!selectedChatbotId || !trimmedQuestion) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      text: trimmedQuestion,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setError(null);
    setIsSending(true);

    try {
      const response = await runRuntimeChat({
        chatbotId: selectedChatbotId,
        question: trimmedQuestion,
        topK: 8,
      });

      const assistantMessage: ChatMessage = {
        id: `assistant_${response.requestId}`,
        role: "assistant",
        text: response.answer.text,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch {
      setError("응답을 불러오지 못했습니다.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <PagePanel title="챗봇 테스트" description="위젯 없이 기관관리자 권한으로 챗봇 응답을 테스트합니다.">
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">챗봇 선택</span>
            <select
              value={selectedChatbotId}
              onChange={(event) => {
                setSelectedChatbotId(event.target.value);
                setMessages([]);
                setError(null);
              }}
              disabled={isLoading || chatbots.length === 0}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
            >
              {chatbots.map((chatbot) => (
                <option key={chatbot.id} value={chatbot.id}>
                  {chatbot.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {selectedChatbot ? `${selectedChatbot.name} 테스트 중` : "선택된 챗봇이 없습니다."}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
          <div className="h-[420px] space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                {isLoading ? "챗봇 목록을 불러오는 중..." : "질문을 입력해 테스트를 시작하세요."}
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={[
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                      message.role === "user"
                        ? "bg-slate-100 text-slate-900"
                        : "bg-slate-900 text-white",
                    ].join(" ")}
                  >
                    <p className="mb-1 text-xs opacity-70">
                      {message.role === "user" ? "사용자" : "챗봇"}
                    </p>
                    <p className="whitespace-pre-wrap">{message.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
            <div className="flex gap-3">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="메시지를 입력하세요."
                rows={3}
                disabled={!selectedChatbotId || isSending}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={!selectedChatbotId || !question.trim() || isSending}
                className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSending ? "전송 중..." : "전송"}
              </button>
            </div>
          </form>
        </div>
      </PagePanel>
    </div>
  );
}
