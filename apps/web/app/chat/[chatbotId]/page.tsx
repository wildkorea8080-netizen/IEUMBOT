"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface ConfigResponse {
  chatbotId?: string;
  chatbot_id?: string;
  chatbotName?: string;
  chatbot_name?: string;
  institutionName?: string | null;
  institution_name?: string | null;
  logoUrl?: string | null;
  logo_url?: string | null;
  welcomeMessage?: string;
  welcome_message?: string;
  quickReplyHints?: string[];
  quick_reply_hints?: string[];
  theme?: {
    primaryColor?: string;
    primary_color?: string;
    backgroundColor?: string;
    background_color?: string;
    textColor?: string;
    text_color?: string;
  };
}

interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
}

const API_BASE_URL = "/backend-api";

export default function StandaloneChatPage() {
  const params = useParams();
  const chatbotId = params?.chatbotId as string;

  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sessionToken = useRef<string>(
    (() => {
      if (typeof window === "undefined") return `session_${Date.now()}`;
      const key = `ieum_session_${chatbotId}`;
      const stored = localStorage.getItem(key);
      if (stored) return stored;
      const newToken = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, newToken);
      return newToken;
    })(),
  );

  useEffect(() => {
    if (!chatbotId) return;
    fetch(`${API_BASE_URL}/widget/config/${encodeURIComponent(chatbotId)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`WIDGET_CONFIG_FAILED:${response.status}`);
        }
        return response.json();
      })
      .then((data: ConfigResponse) => {
        const welcomeMessage = data.welcomeMessage ?? data.welcome_message;
        setConfig(data);
        if (welcomeMessage) {
          setMessages([{ role: "assistant", content: welcomeMessage, id: "welcome" }]);
        }
      })
      .catch(() => setConfigError("챗봇 정보를 불러올 수 없습니다."));
  }, [chatbotId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const primaryColor = config?.theme?.primaryColor || config?.theme?.primary_color || "#2563eb";
  const chatbotName = config?.chatbotName ?? config?.chatbot_name ?? "AI 챗봇";
  const institutionName = config?.institutionName ?? config?.institution_name;
  const logoUrl = config?.logoUrl ?? config?.logo_url;
  const quickReplyHints = config?.quickReplyHints ?? config?.quick_reply_hints ?? [];

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !chatbotId) return;
    const question = text.trim();
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: question, id: `user_${Date.now()}` }]);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatbotId,
          question,
          sessionToken: sessionToken.current,
          sourceUrl: window.location.href,
        }),
      });
      if (!response.ok) {
        throw new Error(`CHAT_MESSAGE_FAILED:${response.status}`);
      }
      const data = await response.json();
      const answer = data?.answer?.text || data?.answer || "죄송합니다. 답변을 가져오지 못했습니다.";
      setMessages((prev) => [...prev, { role: "assistant", content: answer, id: `bot_${Date.now()}` }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          id: `err_${Date.now()}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (configError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <p style={{ color: "#ef4444" }}>{configError}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <p style={{ color: "#94a3b8" }}>로딩 중...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 720, margin: "0 auto", background: "#fff" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12, background: primaryColor }}>
        {logoUrl && <img src={logoUrl} alt="logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />}
        <div>
          <p style={{ fontWeight: 700, color: "#fff", margin: 0, fontSize: 15 }}>{chatbotName}</p>
          {institutionName && <p style={{ color: "rgba(255,255,255,0.8)", margin: 0, fontSize: 12 }}>{institutionName}</p>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: msg.role === "user" ? primaryColor : "#f1f5f9",
                color: msg.role === "user" ? "#fff" : "#1e293b",
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "#f1f5f9", color: "#94a3b8", fontSize: 14 }}>
              입력 중...
            </div>
          </div>
        )}

        {messages.length === 1 && quickReplyHints.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {quickReplyHints.map((hint, index) => (
              <button
                key={`${hint}-${index}`}
                onClick={() => void sendMessage(hint)}
                style={{
                  background: "#f0f4ff",
                  border: `1px solid ${primaryColor}40`,
                  borderRadius: 16,
                  padding: "6px 14px",
                  fontSize: 13,
                  color: primaryColor,
                  cursor: "pointer",
                }}
              >
                {hint}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(input);
            }
          }}
          placeholder="메시지를 입력하세요..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 24,
            border: "1px solid #e2e8f0",
            fontSize: 14,
            outline: "none",
            background: isLoading ? "#f8fafc" : "#fff",
          }}
        />
        <button
          onClick={() => void sendMessage(input)}
          disabled={isLoading || !input.trim()}
          style={{
            background: input.trim() && !isLoading ? primaryColor : "#cbd5e1",
            border: "none",
            borderRadius: "50%",
            width: 44,
            height: 44,
            cursor: input.trim() && !isLoading ? "pointer" : "default",
            color: "#fff",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
