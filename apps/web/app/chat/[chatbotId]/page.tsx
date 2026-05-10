"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface ConfigResponse {
  chatbot_id: string;
  chatbot_name: string;
  institution_name?: string | null;
  logo_url?: string | null;
  welcome_message: string;
  quick_reply_hints?: string[];
  theme?: {
    primary_color?: string;
    background_color?: string;
    text_color?: string;
  };
}

interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
}

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
    fetch(`/api/widget/config/${chatbotId}`)
      .then((r) => r.json())
      .then((data: ConfigResponse) => {
        setConfig(data);
        if (data.welcome_message) {
          setMessages([
            {
              role: "assistant",
              content: data.welcome_message,
              id: "welcome",
            },
          ]);
        }
      })
      .catch(() => setConfigError("챗봇 정보를 불러올 수 없습니다."));
  }, [chatbotId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const primaryColor = config?.theme?.primary_color || "#2563eb";

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !chatbotId) return;
    const question = text.trim();
    setInput("");

    const userMsg: Message = {
      role: "user",
      content: question,
      id: `user_${Date.now()}`,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatbot_id: chatbotId,
          question,
          session_token: sessionToken.current,
          source_url: window.location.href,
        }),
      });
      const data = await res.json();
      const answer =
        data?.answer?.text ||
        data?.answer ||
        "죄송합니다. 답변을 가져오지 못했습니다.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer, id: `bot_${Date.now()}` },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
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
        {config.logo_url && (
          <img src={config.logo_url} alt="logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
        )}
        <div>
          <p style={{ fontWeight: 700, color: "#fff", margin: 0, fontSize: 15 }}>{config.chatbot_name}</p>
          {config.institution_name && (
            <p style={{ color: "rgba(255,255,255,0.8)", margin: 0, fontSize: 12 }}>{config.institution_name}</p>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
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

        {messages.length === 1 && config.quick_reply_hints && config.quick_reply_hints.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {config.quick_reply_hints.map((hint, i) => (
              <button
                key={i}
                onClick={() => sendMessage(hint)}
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
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
          ↑
        </button>
      </div>
    </div>
  );
}
