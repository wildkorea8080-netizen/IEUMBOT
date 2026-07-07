import type {
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  WidgetConsultationSnapshot,
  WidgetPublicConfig,
} from "../types";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export class WidgetApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = trimTrailingSlash(baseUrl);
  }

  async getConfig(chatbotId: string): Promise<WidgetPublicConfig> {
    const response = await fetch(`${this.baseUrl}/widget/config/${encodeURIComponent(chatbotId)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
    });
    if (!response.ok) {
      throw new Error(`WIDGET_CONFIG_FAILED:${response.status}`);
    }
    return (await response.json()) as WidgetPublicConfig;
  }

  async getConsultationSnapshot(
    chatbotId: string,
    chunkId: string,
  ): Promise<WidgetConsultationSnapshot> {
    const response = await fetch(
      `${this.baseUrl}/widget/consultation/${encodeURIComponent(chatbotId)}/${encodeURIComponent(chunkId)}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
      },
    );
    if (!response.ok) {
      throw new Error(`WIDGET_SNAPSHOT_FAILED:${response.status}`);
    }
    return (await response.json()) as WidgetConsultationSnapshot;
  }

  async sendChat(body: ChatRequest, chatEndpoint = "/chat/messages"): Promise<ChatResponse> {
    const endpoint = chatEndpoint.startsWith("/") ? chatEndpoint : `/${chatEndpoint}`;
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
    });
    if (!response.ok) {
      throw new Error(`WIDGET_CHAT_FAILED:${response.status}`);
    }
    return (await response.json()) as ChatResponse;
  }

  async sendFeedback(messageId: string, feedback: 1 | -1): Promise<void> {
    await fetch(`${this.baseUrl}/chat/messages/${encodeURIComponent(messageId)}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
      credentials: "omit",
    });
    // 실패해도 throw하지 않음 — 호출자가 catch로 처리
  }

  async streamChat(
    body: ChatRequest,
    onEvent: (event: ChatStreamEvent) => void,
    chatStreamEndpoint = "/chat/messages/stream",
  ): Promise<void> {
    const endpoint = chatStreamEndpoint.startsWith("/") ? chatStreamEndpoint : `/${chatStreamEndpoint}`;
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      credentials: "omit",
    });
    if (!response.ok || !response.body) {
      throw new Error(`WIDGET_CHAT_STREAM_FAILED:${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let eventBoundary = buffer.indexOf("\n\n");
      while (eventBoundary !== -1) {
        const rawEvent = buffer.slice(0, eventBoundary).trim();
        buffer = buffer.slice(eventBoundary + 2);
        eventBoundary = buffer.indexOf("\n\n");
        if (!rawEvent) continue;

        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (dataLines.length === 0) continue;
        try {
          const parsed = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
          onEvent({
            event: eventName as ChatStreamEvent["event"],
            data: parsed,
          });
        } catch {
          onEvent({
            event: "error",
            data: { code: "STREAM_EVENT_PARSE_FAILED", message: "스트림 이벤트 파싱 실패" },
          });
        }
      }
    }
  }
}
