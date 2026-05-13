"use client";

import { useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ChatDebugTrace } from "../../../components/admin/chat-debug-trace";
import { ApiClientError } from "../../../lib/api";
import { sendAdminTestChatMessage } from "../../../lib/api/runtime-chat";
import type { ChatCitation, ChatRuntimeResponse } from "../../../lib/api/runtime-chat-types";

type ChatTurn =
  | { id: string; role: "user"; question: string; createdAt: number }
  | {
      id: string;
      role: "assistant";
      response: ChatRuntimeResponse;
      createdAt: number;
    };

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "테스트 요청 처리 중 오류가 발생했습니다.";
}

function formatScore(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(4);
}

function outcomeLabel(outcome: string): string {
  if (outcome === "answered") return "응답 완료";
  if (outcome === "insufficient_evidence") return "근거 부족";
  if (outcome === "restricted") return "정책 제한";
  if (outcome === "conflict") return "근거 충돌";
  if (outcome === "escalate") return "이관 권장";
  return outcome;
}

function compactMap(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "-";
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return "-";
  }
  return entries
    .slice(0, 6)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" | ");
}

function renderCitation(citation: ChatCitation, index: number) {
  return (
    <li key={`${citation.documentVersionId ?? "none"}-${index}`} className="rounded-md border border-slate-200 p-2">
      <p className="font-medium text-slate-900">{citation.documentName ?? "문서명 없음"}</p>
      <p className="mt-1">
        문서ID: {citation.documentId ?? "-"} | 버전ID: {citation.documentVersionId ?? "-"}
      </p>
      <p className="mt-1">
        페이지: {citation.pageNumber ?? "-"} | 섹션: {citation.sectionTitle ?? "-"}
      </p>
      <p className="mt-1">
        소스: {citation.sourceType ?? "-"} | rank: {citation.finalRank ?? "-"} | score:{" "}
        {formatScore(citation.score)}
      </p>
      {citation.sourceUrl ? <p className="mt-1 break-all">URL: {citation.sourceUrl}</p> : null}
    </li>
  );
}

export default function TestChatPage() {
  const [chatbotId, setChatbotId] = useState("");
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(8);
  const [isSending, setIsSending] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null);

  const assistantTurns = useMemo(
    () => turns.filter((item): item is Extract<ChatTurn, { role: "assistant" }> => item.role === "assistant"),
    [turns],
  );
  const selectedAssistant = useMemo(() => {
    if (!selectedAssistantId) {
      return assistantTurns.at(-1) ?? null;
    }
    return assistantTurns.find((item) => item.id === selectedAssistantId) ?? assistantTurns.at(-1) ?? null;
  }, [assistantTurns, selectedAssistantId]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentChatbotId = chatbotId.trim();
    const currentQuestion = question.trim();
    if (!currentChatbotId) {
      setErrorMessage("챗봇 ID를 입력하세요.");
      return;
    }
    if (!currentQuestion) {
      setErrorMessage("질문을 입력하세요.");
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    const userTurn: ChatTurn = {
      id: `u_${Date.now()}`,
      role: "user",
      question: currentQuestion,
      createdAt: Date.now(),
    };
    setTurns((prev) => [...prev, userTurn]);
    setQuestion("");

    try {
      const response = await sendAdminTestChatMessage(currentChatbotId, currentQuestion, { topK });
      const assistantTurn: ChatTurn = {
        id: `a_${response.requestId}`,
        role: "assistant",
        response,
        createdAt: Date.now(),
      };
      setTurns((prev) => [...prev, assistantTurn]);
      setSelectedAssistantId(assistantTurn.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function renderFollowUpQuestions(items: string[] | undefined) {
    const questions = (items ?? []).slice(0, 3);
    if (questions.length === 0) return null;
    return (
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-600">이런 질문들은 어떠신가요? </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {questions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setQuestion(item)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PagePanel
        title="테스트 채팅"
        description="운영자가 실제 런타임 파이프라인을 점검하고 정책/가드레일 동작을 확인하는 관리자 전용 콘솔입니다."
      >
        <form onSubmit={handleSend} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-xs text-slate-700">
              챗봇 ID
              <input
                value={chatbotId}
                onChange={(event) => setChatbotId(event.target.value)}
                placeholder="챗봇 UUID"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs text-slate-700">
              topK
              <input
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(event) => setTopK(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-end gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={debugEnabled}
                onChange={(event) => setDebugEnabled(event.target.checked)}
                className="mb-2"
              />
              <span className="mb-1 font-medium">디버그 보기</span>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setSelectedAssistantId(null);
                  setErrorMessage(null);
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                세션 초기화
              </button>
            </div>
          </div>
          <label className="block text-xs text-slate-700">
            질문
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              rows={3}
              placeholder="질문을 입력하고 전송하세요."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSending}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {isSending ? "실행 중..." : "전송"}
            </button>
            {errorMessage ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </form>
      </PagePanel>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <PagePanel
          title="A. 대화 패널"
          description="현재 관리자 테스트 세션의 질문/응답 히스토리를 확인합니다."
        >
          <div className="space-y-2">
            {turns.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                질문을 입력하고 테스트를 실행하세요.
              </div>
            ) : (
              turns.map((turn) =>
                turn.role === "user" ? (
                  <article key={turn.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="text-xs font-semibold text-slate-500">사용자</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-900">{turn.question}</p>
                  </article>
                ) : (
                  <article
                    key={turn.id}
                    className={[
                      "cursor-pointer rounded-md border p-3 text-sm",
                      selectedAssistant?.id === turn.id
                        ? "border-brand-300 bg-brand-50"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    ].join(" ")}
                    onClick={() => setSelectedAssistantId(turn.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-500">어시스턴트</p>
                      <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                        {outcomeLabel(turn.response.outcome)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-slate-900">{turn.response.answer.text}</p>
                    {renderFollowUpQuestions(turn.response.followUpQuestions)}
                  </article>
                ),
              )
            )}
          </div>
        </PagePanel>

        <div className="space-y-4">
          <PagePanel
            title="B. 최종 응답"
            description="선택된 응답의 결과 마커, 답변 내용, 인용 정보를 확인합니다."
          >
            {!selectedAssistant ? (
              <p className="text-sm text-slate-600">선택된 응답이 없습니다.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                    결과: {selectedAssistant.response.outcome}
                  </span>
                  <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                    요청 ID: {selectedAssistant.response.requestId}
                  </span>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="whitespace-pre-wrap text-slate-900">{selectedAssistant.response.answer.text}</p>
                  {renderFollowUpQuestions(selectedAssistant.response.followUpQuestions)}
                  {debugEnabled ? <ChatDebugTrace trace={selectedAssistant.response.trace} /> : null}
                </div>
                {(selectedAssistant.response.answer.warnings ?? []).length > 0 ? (
                  <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {(selectedAssistant.response.answer.warnings ?? []).map((warning, index) => (
                      <li key={`${warning}-${index}`}>- {warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-700">인용</p>
                  {selectedAssistant.response.citations.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                      인용이 없습니다. 정책 차단/근거 부족으로 답변이 제한되었을 수 있습니다.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-xs text-slate-700">
                      {selectedAssistant.response.citations.map(renderCitation)}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </PagePanel>

          <PagePanel
            title="C. 파이프라인 트레이스"
            description="정규화 질의, 정책 판단, 가드레일 매칭, LLM 실행 여부를 확인합니다."
          >
            {!selectedAssistant ? (
              <p className="text-sm text-slate-600">응답을 선택하면 트레이스가 표시됩니다.</p>
            ) : (
              <div className="space-y-2 text-xs text-slate-700">
                <p>정규화 질의: {String(selectedAssistant.response.trace.normalizedQuery ?? "-")}</p>
                <p>정책 판단: {compactMap(selectedAssistant.response.policyDecision)}</p>
                <p>검색 결과: {compactMap(selectedAssistant.response.trace.retrieval)}</p>
                <p>가드레일: {compactMap(selectedAssistant.response.trace.guardrail)}</p>
                <p>
                  LLM: 실행={String(selectedAssistant.response.trace.llm?.executed ?? false)} | 오류 코드=
                  {String(selectedAssistant.response.trace.llm?.errorCode ?? "-")}
                </p>
                <p>메시지: {compactMap(selectedAssistant.response.trace.messages)}</p>
              </div>
            )}
          </PagePanel>

          <PagePanel
            title="D. 검색 근거 요약"
            description="선택된 응답에서 사용된 문서 근거 요약(문서/코퍼스/점수)을 표시합니다."
          >
            {!selectedAssistant ? (
              <p className="text-sm text-slate-600">응답을 선택하면 근거 요약이 표시됩니다.</p>
            ) : selectedAssistant.response.citations.length === 0 ? (
              <p className="text-sm text-slate-600">
                표시할 검색 근거가 없습니다. 차단 응답이거나 인용 조립이 생략된 상태일 수 있습니다.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="px-2 py-1">문서</th>
                      <th className="px-2 py-1">자료 유형</th>
                      <th className="px-2 py-1">페이지/섹션</th>
                      <th className="px-2 py-1">점수</th>
                      <th className="px-2 py-1">순위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAssistant.response.citations.map((citation, index) => (
                      <tr key={`${citation.documentVersionId ?? "row"}-${index}`} className="border-b border-slate-100">
                        <td className="px-2 py-1 text-slate-900">{citation.documentName ?? "-"}</td>
                        <td className="px-2 py-1">{citation.sourceType ?? "-"}</td>
                        <td className="px-2 py-1">
                          {citation.pageNumber ?? "-"} / {citation.sectionTitle ?? "-"}
                        </td>
                        <td className="px-2 py-1">{formatScore(citation.score)}</td>
                        <td className="px-2 py-1">{citation.finalRank ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PagePanel>
        </div>
      </div>
    </div>
  );
}
