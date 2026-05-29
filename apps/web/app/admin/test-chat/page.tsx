"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { RefreshCw, Send } from "lucide-react";

import { looksLikeHtml, sanitizeHtml } from "../../../lib/safe-html";

import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots } from "../../../lib/api/admin-operations";
import { sendAdminTestChatMessage } from "../../../lib/api/runtime-chat";
import type { ChatCitation, ChatRuntimeResponse } from "../../../lib/api/runtime-chat-types";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type ChatTurn =
  | { id: string; role: "user"; question: string; time: string }
  | { id: string; role: "assistant"; response: ChatRuntimeResponse; time: string; elapsedMs: number };

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  return "테스트 요청 처리 중 오류가 발생했습니다.";
}

function nowTime() {
  return new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function secLabel(ms: number | null | undefined) {
  if (ms == null) return "-";
  return `${(ms / 1000).toFixed(2)}초`;
}

function scorePercent(score: number | null | undefined) {
  if (score == null) return null;
  return `${(score * 100).toFixed(1)}%`;
}

// ── 메시지 렌더 ───────────────────────────────────────────────────────────────

function UserBubble({ question, time }: { question: string; time: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginBottom: 20 }}>
      <div style={{
        background: "#ef4444", color: "#fff",
        borderRadius: "20px 20px 4px 20px",
        padding: "10px 18px", fontSize: 14, maxWidth: "70%", lineHeight: 1.6,
      }}>{question}</div>
      <span style={{ fontSize: 11, color: "#9ca3af" }}>{time}</span>
    </div>
  );
}

function AssistantBubble({ response, time }: { response: ChatRuntimeResponse; time: string }) {
  const text = response.answer.text || "";
  const isHtml = looksLikeHtml(text);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
      {isHtml ? (
        <div
          className="ieum-rich-answer"
          style={{ fontSize: 14, color: "#111827", lineHeight: 1.8 }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
        />
      ) : (
        <div style={{ fontSize: 14, color: "#111827", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
          {text}
        </div>
      )}
      <span style={{ fontSize: 11, color: "#9ca3af" }}>{time}</span>
    </div>
  );
}

function FollowUpQuestions({ questions, onSelect }: { questions: string[]; onSelect: (q: string) => void }) {
  if (questions.length === 0) return null;
  return (
    <div style={{ marginTop: 4, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
        <span>✦</span>
        <span>이런 질문들은 어떠신가요?</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.slice(0, 3).map(q => (
          <button key={q} type="button" onClick={() => onSelect(q)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: 10,
              background: "#fff", fontSize: 13, color: "#374151", cursor: "pointer",
              textAlign: "left",
            }}>
            <span style={{ flex: 1, marginRight: 10 }}>{q}</span>
            <span style={{ color: "#9ca3af", flexShrink: 0 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 우측 정보 패널 ─────────────────────────────────────────────────────────────

function InfoPanel({ turn, showPanel }: {
  turn: Extract<ChatTurn, { role: "assistant" }> | null;
  showPanel: boolean;
}) {
  if (!showPanel) return null;

  const trace = turn?.response.trace;
  const citations: ChatCitation[] = turn?.response.citations ?? [];
  const retrievalMs = trace?.retrieval?.latencyMs ?? null;
  const llmMs = trace?.llm?.latencyMs ?? null;
  const totalMs = trace?.latencyMs ?? turn?.elapsedMs ?? null;
  const outputMs = totalMs != null && llmMs != null ? totalMs - llmMs : totalMs;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%", overflowY: "auto" }}>
      {/* 성능 지표 */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12 }}>성능 지표</div>
        {[
          { label: "정보 조회 시간", value: secLabel(retrievalMs) },
          { label: "추론 완료 시간", value: secLabel(llmMs ?? totalMs) },
          { label: "출력 완료 시간", value: secLabel(outputMs) },
        ].map(row => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
            <span style={{ color: "#6b7280" }}>{row.label}</span>
            <span style={{ color: "#111827", fontWeight: 500 }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* 조회된 정보 */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12 }}>조회된 정보</div>
        {citations.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>조회된 정보가 없습니다.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {citations.map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f9fafb" }}>
                <span style={{ fontSize: 13, color: "#374151", flex: 1, marginRight: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.documentName ?? "-"}
                </span>
                <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>유사도({scorePercent(c.score) ?? "-"})</span>
              </div>
            ))}
          </div>
        )}
        {citations.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6b7280" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", flexShrink: 0, display: "inline-block" }} />
            답변에 참고한 정보
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

export default function TestChatPage() {
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [chatbotName, setChatbotName] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const lastAssistantTurn = [...turns].reverse().find(
    (t): t is Extract<ChatTurn, { role: "assistant" }> => t.role === "assistant"
  ) ?? null;

  useEffect(() => {
    void (async () => {
      try {
        const res = await getAdminChatbots();
        setChatbots(res.items);
        if (res.items[0]) { setChatbotId(res.items[0].id); setChatbotName(res.items[0].name); }
      } catch { /* silently ignore */ }
    })();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!chatbotId || !question.trim() || isSending) return;
    const q = question.trim();
    setQuestion("");
    setErrorMessage(null);
    setTurns(prev => [...prev, { id: `u_${Date.now()}`, role: "user", question: q, time: nowTime() }]);
    setIsSending(true);
    const start = Date.now();
    try {
      const response = await sendAdminTestChatMessage(chatbotId, q, { topK: 8 });
      const elapsedMs = Date.now() - start;
      setTurns(prev => [...prev, { id: `a_${Date.now()}`, role: "assistant", response, time: nowTime(), elapsedMs }]);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
      setTurns(prev => prev.slice(0, -1));
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  function handleChatbotChange(id: string) {
    const chatbot = chatbots.find(c => c.id === id);
    setChatbotId(id);
    setChatbotName(chatbot?.name ?? "");
  }

  function reset() {
    setTurns([]);
    setErrorMessage(null);
  }

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 96px)", minHeight: 500 }}>

      {/* ── 왼쪽: 채팅 패널 ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* 채팅 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
            {chatbots.length > 1 ? (
              <select value={chatbotId} onChange={e => handleChatbotChange(e.target.value)}
                style={{ fontSize: 15, fontWeight: 700, color: "#111827", border: "none", background: "transparent", outline: "none", cursor: "pointer" }}>
                {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{chatbotName || "챗봇"}</span>
            )}
          </div>
          <button type="button" onClick={reset}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", fontSize: 13, color: "#374151", cursor: "pointer" }}>
            <RefreshCw style={{ width: 13, height: 13 }} />초기화
          </button>
        </div>

        {/* 메시지 영역 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 8px" }}>
          {turns.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 32, color: "#9ca3af" }}>💬</div>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#374151", textAlign: "center" }}>당신의 궁금증, 에이전트에게 물어보세요~</p>
            </div>
          ) : (
            <>
              {turns.map(turn => {
                if (turn.role === "user") {
                  return <UserBubble key={turn.id} question={turn.question} time={turn.time} />;
                }
                const followUps = turn.response.followUpQuestions ?? turn.response.trace.followUpQuestions ?? [];
                return (
                  <div key={turn.id}>
                    <AssistantBubble response={turn.response} time={turn.time} />
                    <FollowUpQuestions questions={followUps} onSelect={q => setQuestion(q)} />
                  </div>
                );
              })}
              {isSending && (
                <div style={{ display: "flex", gap: 4, padding: "8px 0 16px" }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#d1d5db", animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* 에러 */}
        {errorMessage && (
          <div style={{ padding: "8px 20px", fontSize: 12, color: "#dc2626", background: "#fef2f2", borderTop: "1px solid #fecaca", flexShrink: 0 }}>{errorMessage}</div>
        )}

        {/* 입력창 */}
        <form onSubmit={handleSend} style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={chatbotId ? "메시지를 입력하세요..." : "챗봇을 먼저 선택하세요."}
            disabled={!chatbotId || isSending}
            style={{
              flex: 1, padding: "12px 16px", border: "1.5px solid #e5e7eb", borderRadius: 24,
              fontSize: 14, outline: "none", background: "#fff",
              borderColor: question ? "#2563eb" : "#e5e7eb", transition: "border-color 0.15s",
            }}
          />
          <button type="submit" disabled={!question.trim() || !chatbotId || isSending}
            style={{
              width: 44, height: 44, borderRadius: "50%", border: "none",
              background: (!question.trim() || !chatbotId || isSending) ? "#d1d5db" : "#111827",
              cursor: (!question.trim() || !chatbotId || isSending) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
            <Send style={{ width: 16, height: 16, color: "#fff" }} />
          </button>
        </form>
      </div>

      {/* ── 오른쪽: 응답 상세 정보 ──────────────────────────────────────────── */}
      <div style={{ width: 300, flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px", display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}>
        {/* 패널 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>응답 상세 정보</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>AI 답변 생성의 근거 및 성능 정보를 확인합니다.</div>
          </div>
          {/* AI 설정 토글 */}
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 2, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>AI 설정</span>
            <div onClick={() => setShowPanel(p => !p)} style={{
              width: 40, height: 22, borderRadius: 11,
              background: showPanel ? "#2563eb" : "#e5e7eb",
              position: "relative", cursor: "pointer", transition: "background 0.2s",
            }}>
              <div style={{
                position: "absolute", top: 3, left: showPanel ? 21 : 3,
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 0.2s",
              }} />
            </div>
          </label>
        </div>

        <div style={{ flex: 1, overflowY: "auto", marginTop: 16 }}>
          <InfoPanel turn={lastAssistantTurn} showPanel={showPanel} />
        </div>
      </div>

      {/* 바운스 애니메이션 */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
