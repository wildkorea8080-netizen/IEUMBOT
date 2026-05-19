"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, ExternalLink, RefreshCw, Settings2 } from "lucide-react";

import { ChatDebugTrace } from "../../../components/admin/chat-debug-trace";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots, getAdminChatbot, patchAdminChatbot } from "../../../lib/api/admin-operations";
import { getAnswerSettings, patchAnswerSettings } from "../../../lib/api/answer-settings";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";
import { sendAdminTestChatMessage } from "../../../lib/api/runtime-chat";
import type { ChunkDetail, ChatRuntimeResponse, PerformanceMetrics } from "../../../lib/api/runtime-chat-types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  response?: ChatRuntimeResponse;
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

function ChunkCard({ chunk }: { chunk: ChunkDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <span style={{ flex: 1, color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {chunk.documentName}{chunk.sectionTitle ? ` / ${chunk.sectionTitle}` : ""}
        </span>
        <span style={{ color: chunk.score >= 0.7 ? "#4ade80" : chunk.score >= 0.45 ? "#fbbf24" : "#f87171", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
          {chunk.score.toFixed(3)}
        </span>
        {chunk.reranked && <span style={{ fontSize: 9, background: "#7c3aed", color: "#fff", borderRadius: 4, padding: "1px 5px" }}>RE</span>}
        {open ? <ChevronUp style={{ width: 12, height: 12, color: "#64748b" }} /> : <ChevronDown style={{ width: 12, height: 12, color: "#64748b" }} />}
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          <div style={{ background: "#0f172a", borderRadius: 6, padding: "6px 8px", color: "#94a3b8", fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto" }}>
            {chunk.textPreview || "(미리보기 없음)"}
          </div>
          {chunk.sourceUrl && (
            <a href={chunk.sourceUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 4, fontSize: 10, color: "#38bdf8", textDecoration: "none" }}>
              <ExternalLink style={{ width: 10, height: 10 }} />출처 보기
            </a>
          )}
        </div>
      )}
    </div>
  );
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
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 우측 AI 설정 패널 상태 ──────────────────────────────────────────────
  const [panelTone, setPanelTone] = useState<"formal" | "polite" | "plain">("polite");
  const [panelLength, setPanelLength] = useState<"short" | "medium" | "long">("medium");
  const [panelTopK, setPanelTopK] = useState(8);
  const [panelSaving, setPanelSaving] = useState(false);
  const [panelSaved, setPanelSaved] = useState(false);

  async function applyPanelSettings() {
    if (!selectedChatbotId) return;
    setPanelSaving(true);
    try {
      const [, settings] = await Promise.all([
        patchAdminChatbot(selectedChatbotId, { tone: panelTone, answerLength: panelLength }),
        getAnswerSettings(selectedChatbotId),
      ]);
      const next = { ...settings.settings };
      next.promptInstruction = { ...next.promptInstruction, toneMode: panelTone };
      next.answerFormat = { ...next.answerFormat, maxAnswerLengthMode: panelLength };
      await patchAnswerSettings(selectedChatbotId, { settings: next });
      setPanelSaved(true);
      setTimeout(() => setPanelSaved(false), 2000);
    } catch { /* 실패해도 테스트 계속 가능 */ }
    finally { setPanelSaving(false); }
  }

  async function loadPanelSettings(chatbotId: string) {
    try {
      const chatbot = await getAdminChatbot(chatbotId);
      if (chatbot.tone === "formal" || chatbot.tone === "polite" || chatbot.tone === "plain") {
        setPanelTone(chatbot.tone as "formal" | "polite" | "plain");
      }
      if (chatbot.answerLength === "short" || chatbot.answerLength === "medium" || chatbot.answerLength === "long") {
        setPanelLength(chatbot.answerLength as "short" | "medium" | "long");
      }
    } catch { /* ignore */ }
  }

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
        void loadPanelSettings(initialChatbot.id);
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
    const targetChatbotId = (preferredChatbotId || selectedChatbotId).trim();
    if (!targetChatbotId || !trimmedQuestion) return;

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
      const response = await sendAdminTestChatMessage(targetChatbotId, trimmedQuestion, { topK: 8 });

      const assistantMessage: ChatMessage = {
        id: `assistant_${response.requestId}`,
        role: "assistant",
        text: response.answer.text,
        response,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch {
      setError("응답을 불러오지 못했습니다.");
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

  function renderPerformance(perf: PerformanceMetrics | undefined) {
    if (!perf || perf.totalMs == null) return null;
    const rows: { label: string; ms: number | null | undefined; highlight?: boolean }[] = [
      { label: "인텐트 분류", ms: perf.intentClassifyMs },
      { label: "쿼리 리라이팅", ms: perf.queryRewriteMs },
      { label: "RAG 검색", ms: perf.retrievalMs, highlight: true },
      { label: "Re-ranking", ms: perf.rerankMs },
      { label: "외부 API", ms: perf.apiFetchMs },
      { label: "LLM 생성", ms: perf.llmMs, highlight: true },
      { label: "전체 처리", ms: perf.totalMs, highlight: true },
    ];
    return (
      <div style={{ marginTop: 10, padding: "10px 14px", background: "#0f172a", borderRadius: 10, fontSize: 12, color: "#94a3b8" }}>
        <p style={{ color: "#7dd3fc", fontWeight: 700, marginBottom: 6 }}>⚡ 성능 지표</p>
        {rows.map(r => r.ms != null && (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: r.highlight ? "#e2e8f0" : "#94a3b8" }}>{r.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: r.highlight ? "#7dd3fc" : "#64748b" }}>
              {r.ms.toLocaleString("ko-KR")}ms
            </span>
          </div>
        ))}
      </div>
    );
  }

  function renderChunks(chunks: ChunkDetail[] | undefined) {
    if (!chunks || chunks.length === 0) return null;
    return (
      <div style={{ marginTop: 10, padding: "10px 14px", background: "#0f172a", borderRadius: 10, fontSize: 12 }}>
        <p style={{ color: "#7dd3fc", fontWeight: 700, marginBottom: 8 }}>📚 참조 청크 ({chunks.length}개)</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {chunks.map((c, i) => (
            <ChunkCard key={c.chunkId || i} chunk={c} />
          ))}
        </div>
      </div>
    );
  }

  function renderFollowUpQuestions(items: string[] | undefined) {
    const questions = (items ?? []).slice(0, 3);
    if (questions.length === 0) return null;
    return (
      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
        <p className="text-xs font-semibold text-slate-300">이런 질문들은 어떠신가요? </p>
        <div className="mt-2 flex flex-col gap-2">
          {questions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setQuestion(item)}
              className="rounded-md border border-slate-600 bg-white px-2 py-1 text-left text-xs text-slate-800 hover:bg-slate-100"
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
      <div className="mb-2">
        <h1 className="section-title">대화 테스트</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>실제 위젯과 동일하게 챗봇 응답을 테스트하고 AI 설정을 즉시 변경할 수 있습니다.</p>
      </div>

      {/* 2열 레이아웃: 채팅(좌) + AI 설정(우) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
        {/* 좌측: 채팅 영역 */}
        <div>
          {/* 챗봇 선택 + 디버그 */}
          <div className="bg-white rounded-xl border border-neutral-200 p-3 mb-3" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <select
              value={selectedChatbotId}
              onChange={(event) => {
                setSelectedChatbotId(event.target.value);
                setMessages([]);
                setError(null);
                void loadPanelSettings(event.target.value);
              }}
              disabled={isLoading || chatbots.length === 0}
              className="input-field"
              style={{ width: 200 }}
            >
              {chatbots.map((chatbot) => (
                <option key={chatbot.id} value={chatbot.id}>{chatbot.name}</option>
              ))}
            </select>
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              {selectedChatbot ? `${selectedChatbot.name} 테스트 중` : "챗봇을 선택하세요"}
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280", cursor: "pointer", marginLeft: "auto" }}>
              <input type="checkbox" checked={debugEnabled} onChange={(e) => setDebugEnabled(e.target.checked)} />
              디버그 모드
            </label>
          </div>

          {error && (
            <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white">
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
                    {message.response ? renderFollowUpQuestions(message.response.followUpQuestions) : null}
                    {debugEnabled && message.response ? (
                      <>
                        {renderPerformance(message.response.performance)}
                        {renderChunks(message.response.detailedChunks)}
                        <ChatDebugTrace trace={message.response.trace} />
                      </>
                    ) : null}
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
                onKeyDown={handleQuestionKeyDown}
                placeholder="메시지를 입력하세요."
                rows={3}
                disabled={!selectedChatbotId || isSending}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={!selectedChatbotId || !question.trim() || isSending}
                className="btn-primary self-end"
                style={{ padding: "10px 20px" }}
              >
                {isSending ? "전송 중..." : "전송"}
              </button>
            </div>
          </form>
        </div>
        {/* ── 우측: AI 설정 패널 ── */}
        </div>

        {/* 우측 패널 (2열 grid 외부 absolute sticky) */}
        <div style={{
          background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb",
          padding: 18, position: "sticky", top: 80,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
            <Settings2 style={{ width: 15, height: 15, color: "#2563eb" }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>AI 설정 즉시 변경</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 대화 톤 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>대화 톤</label>
              {([
                { value: "formal",  label: "격식체", desc: "전문적" },
                { value: "polite",  label: "공손체", desc: "정중함" },
                { value: "plain",   label: "평어체", desc: "친근함" },
              ] as const).map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
                  <input type="radio" name="panelTone" value={opt.value} checked={panelTone === opt.value} onChange={() => setPanelTone(opt.value)} style={{ accentColor: "#2563eb" }} />
                  <span style={{ fontSize: 13, color: "#374151" }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{opt.desc}</span>
                </label>
              ))}
            </div>

            {/* 답변 길이 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>답변 길이</label>
              {([
                { value: "short",  label: "짧게" },
                { value: "medium", label: "보통" },
                { value: "long",   label: "자세히" },
              ] as const).map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
                  <input type="radio" name="panelLength" value={opt.value} checked={panelLength === opt.value} onChange={() => setPanelLength(opt.value)} style={{ accentColor: "#2563eb" }} />
                  <span style={{ fontSize: 13, color: "#374151" }}>{opt.label}</span>
                </label>
              ))}
            </div>

            {/* 검색 문서 수 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>
                검색 문서 수: <span style={{ color: "#2563eb" }}>{panelTopK}</span>
              </label>
              <input
                type="range" min={1} max={20} value={panelTopK}
                onChange={(e) => setPanelTopK(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#2563eb" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                <span>1</span><span>20</span>
              </div>
            </div>

            {/* 적용 버튼 */}
            <button
              type="button"
              onClick={() => void applyPanelSettings()}
              disabled={panelSaving || !selectedChatbotId}
              className="btn-primary"
              style={{ width: "100%", padding: "9px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              {panelSaving ? (
                <><RefreshCw style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />적용 중...</>
              ) : panelSaved ? "✓ 적용됨" : "설정 적용"}
            </button>

            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              다음 질문부터 변경된 설정으로 답변합니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
