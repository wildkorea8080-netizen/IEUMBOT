"use strict";

(() => {
  const DEFAULT_API_BASE_URL = "https://ieumbot-api.onrender.com/api";
  const WIDGET_ROOT_ATTR = "data-ieumbot-widget-root";
  const initializedWidgets = new Set();

  function trimTrailingSlash(value) {
    return value.endsWith("/") ? value.slice(0, -1) : value;
  }

  function normalizeBaseUrl(value) {
    if (typeof value !== "string") {
      return DEFAULT_API_BASE_URL;
    }
    const normalized = value.trim();
    return normalized ? trimTrailingSlash(normalized) : DEFAULT_API_BASE_URL;
  }

  function getGlobalConfig() {
    return (
      window.IEUMBOTWidgetConfig ||
      window.IEUMBOT_WIDGET_CONFIG ||
      null
    );
  }

  function resolveApiBaseUrl(explicitValue) {
    if (typeof explicitValue === "string" && explicitValue.trim()) {
      return normalizeBaseUrl(explicitValue);
    }

    const globalConfig = getGlobalConfig();
    if (globalConfig && typeof globalConfig.apiBaseUrl === "string" && globalConfig.apiBaseUrl.trim()) {
      return normalizeBaseUrl(globalConfig.apiBaseUrl);
    }

    return DEFAULT_API_BASE_URL;
  }

  function createElement(documentRef, tagName, className) {
    const element = documentRef.createElement(tagName);
    if (className) {
      element.className = className;
    }
    return element;
  }

  function getOutcomeNote(outcome) {
    if (!outcome || outcome === "answered") return null;
    if (outcome === "insufficient_evidence") {
      return "확인 가능한 근거가 부족해 정확한 안내가 제한됩니다.";
    }
    if (outcome === "restricted") {
      return "해당 질문은 직접 안내가 제한됩니다.";
    }
    if (outcome === "conflict") {
      return "근거 확인이 더 필요한 문의입니다.";
    }
    if (outcome === "escalate") {
      return "담당 부서 확인이 필요한 문의입니다.";
    }
    return null;
  }

  function formatCitation(item) {
    const title = item.documentName || "출처";
    const page = item.pageNumber ? `p.${item.pageNumber}` : null;
    const section = item.sectionTitle || null;
    const sourceUrl = item.sourceUrl || null;
    return [title, page, section, sourceUrl].filter(Boolean).join(" | ");
  }

  function readString(value) {
    return typeof value === "string" ? value : undefined;
  }

  function readBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
  }

  function readArray(value) {
    return Array.isArray(value) ? value : [];
  }

  async function readErrorBody(response) {
    try {
      const text = await response.text();
      if (!text) return "";
      try {
        return JSON.stringify(JSON.parse(text));
      } catch {
        return text;
      }
    } catch {
      return "";
    }
  }

  async function logHttpError(label, url, response) {
    const body = await readErrorBody(response);
    console.error(`[IEUMBOTWidget] ${label}`, {
      url,
      status: response.status,
      statusText: response.statusText,
      body,
    });
  }

  function buildStyles(primaryColor, textColor, backgroundColor) {
    return `
:host { all: initial; }
.ieum-root, .ieum-root * { box-sizing: border-box; font-family: Inter, "Noto Sans KR", Arial, sans-serif; letter-spacing: 0; }
.ieum-root { position: fixed; right: 16px; bottom: 16px; z-index: 2147480000; color: ${textColor}; }
.ieum-launcher { width: 56px; height: 56px; border: none; border-radius: 9999px; background: ${primaryColor}; color: #fff; font-size: 24px; cursor: pointer; box-shadow: 0 10px 24px rgba(0,0,0,.2); }
.ieum-panel { width: min(360px, calc(100vw - 24px)); height: min(640px, calc(100vh - 24px)); border: 1px solid #dbe3ef; border-radius: 8px; background: ${backgroundColor}; display: none; overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,.18); }
.ieum-panel.open { display: grid; grid-template-rows: auto auto 1fr auto; }
.ieum-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e6edf5; padding: 12px; background: #fff; }
.ieum-title { font-size: 14px; font-weight: 600; }
.ieum-close { border: 1px solid #d0d8e4; border-radius: 6px; background: #fff; width: 32px; height: 32px; cursor: pointer; }
.ieum-welcome { border-bottom: 1px solid #eef2f7; padding: 12px; background: #fcfdff; }
.ieum-welcome-text { margin: 0; font-size: 13px; line-height: 1.5; color: #1f2937; }
.ieum-after-hours { margin-top: 8px; padding: 8px 10px; border: 1px solid #fde68a; border-radius: 6px; background: #fffbeb; font-size: 12px; color: #92400e; }
.ieum-quick-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.ieum-quick-action { border: 1px solid #d0d8e4; border-radius: 9999px; background: #fff; padding: 6px 10px; font-size: 12px; cursor: pointer; max-width: 100%; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.ieum-messages { overflow: auto; padding: 12px; background: #fff; }
.ieum-message { margin-bottom: 10px; display: flex; }
.ieum-message.user { justify-content: flex-end; }
.ieum-message.system { justify-content: center; }
.ieum-bubble { max-width: 88%; border-radius: 8px; padding: 8px 10px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.ieum-message.user .ieum-bubble { background: ${primaryColor}; color: #fff; }
.ieum-message.assistant .ieum-bubble { border: 1px solid #dbe3ef; background: #f8fafc; color: #111827; }
.ieum-message.system .ieum-bubble { border: 1px dashed #d1d5db; background: #f9fafb; color: #4b5563; }
.ieum-outcome-note { margin-top: 6px; font-size: 11px; color: #6b7280; }
.ieum-citations { margin-top: 8px; border-top: 1px dashed #d1d5db; padding-top: 6px; }
.ieum-citations-title { font-size: 11px; color: #4b5563; margin-bottom: 4px; font-weight: 600; }
.ieum-citation { font-size: 11px; color: #374151; line-height: 1.4; margin-bottom: 3px; }
.ieum-loading { padding: 0 12px 10px; font-size: 12px; color: #6b7280; }
.ieum-input-wrap { border-top: 1px solid #e6edf5; padding: 10px; display: grid; grid-template-columns: 1fr auto; gap: 8px; background: #fff; }
.ieum-input { border: 1px solid #d0d8e4; border-radius: 8px; min-height: 42px; max-height: 120px; padding: 10px; font-size: 13px; resize: vertical; }
.ieum-send { border: none; border-radius: 8px; min-width: 56px; background: ${primaryColor}; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0 14px; }
.ieum-send:disabled, .ieum-launcher:disabled { opacity: .6; cursor: default; }
.ieum-privacy { padding: 8px 10px; border-top: 1px solid #eef2f7; background: #f8fafc; font-size: 11px; color: #6b7280; line-height: 1.4; }
@media (max-width: 480px) {
  .ieum-root { right: 8px; bottom: 8px; }
  .ieum-panel { width: calc(100vw - 12px); height: min(620px, calc(100vh - 12px)); }
}
`;
  }

  class WidgetApiClient {
    constructor(baseUrl) {
      this.baseUrl = normalizeBaseUrl(baseUrl);
    }

    async getConfig(chatbotId) {
      const url = `${this.baseUrl}/widget/config/${encodeURIComponent(chatbotId)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
      });

      if (!response.ok) {
        await logHttpError("Failed to load widget config", url, response);
        throw new Error(`WIDGET_CONFIG_FAILED:${response.status}`);
      }

      return response.json();
    }

    async sendChat(payload, endpoint = "/chat/messages") {
      const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
      const url = `${this.baseUrl}${path}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
      });

      if (!response.ok) {
        await logHttpError("Failed to send widget chat message", url, response);
        throw new Error(`WIDGET_CHAT_FAILED:${response.status}`);
      }

      return response.json();
    }

    async streamChat(payload, onEvent, endpoint = "/chat/messages/stream") {
      const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
      const url = `${this.baseUrl}${path}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(payload),
        credentials: "omit",
      });

      if (!response.ok) {
        await logHttpError("Failed to open widget chat stream", url, response);
        throw new Error(`WIDGET_CHAT_STREAM_FAILED:${response.status}`);
      }

      if (!response.body) {
        console.error("[IEUMBOTWidget] Widget chat stream opened without response body", {
          url,
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(`WIDGET_CHAT_STREAM_FAILED:${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundaryIndex = buffer.indexOf("\n\n");
        while (boundaryIndex !== -1) {
          const chunk = buffer.slice(0, boundaryIndex).trim();
          buffer = buffer.slice(boundaryIndex + 2);
          boundaryIndex = buffer.indexOf("\n\n");

          if (!chunk) continue;

          let eventName = "message";
          const dataLines = [];
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          }

          if (dataLines.length === 0) continue;

          try {
            onEvent({
              event: eventName,
              data: JSON.parse(dataLines.join("\n")),
            });
          } catch (error) {
            console.error("[IEUMBOTWidget] Failed to parse stream event", {
              url,
              eventName,
              error,
              raw: dataLines.join("\n"),
            });
            onEvent({
              event: "error",
              data: {
                code: "STREAM_EVENT_PARSE_FAILED",
                message: "스트림 이벤트 파싱 실패",
              },
            });
          }
        }
      }
    }
  }

  class WidgetApp {
    constructor(options) {
      this.options = options;
      this.api = new WidgetApiClient(resolveApiBaseUrl(options.apiBaseUrl));
      this.host = document.createElement("div");
      this.host.setAttribute(WIDGET_ROOT_ATTR, "true");
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.root = createElement(document, "div", "ieum-root");
      this.launcherButton = createElement(document, "button", "ieum-launcher");
      this.panel = createElement(document, "div", "ieum-panel");
      this.headerTitle = createElement(document, "div", "ieum-title");
      this.welcomeText = createElement(document, "p", "ieum-welcome-text");
      this.afterHoursBox = createElement(document, "div", "ieum-after-hours");
      this.quickActionsWrap = createElement(document, "div", "ieum-quick-actions");
      this.messagesWrap = createElement(document, "div", "ieum-messages");
      this.loadingRow = createElement(document, "div", "ieum-loading");
      this.input = createElement(document, "textarea", "ieum-input");
      this.sendButton = createElement(document, "button", "ieum-send");
      this.privacyNotice = createElement(document, "div", "ieum-privacy");
      this.initialized = false;
      this.open = false;
      this.sending = false;
      this.sessionToken = `widget_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      this.config = null;
      this.chatEndpoint = "/chat/messages";
      this.chatStreamEndpoint = "/chat/messages/stream";
      this.sseEnabled = false;
      this.messages = [];
      this.lastFailedQuestion = null;

      this.launcherButton.type = "button";
      this.launcherButton.title = options.launcherLabel || "채팅 열기";
      this.launcherButton.textContent = "💬";
      this.headerTitle.textContent = options.title || "이음봇";
      this.afterHoursBox.style.display = "none";
      this.loadingRow.style.display = "none";
      this.loadingRow.textContent = "답변을 준비 중입니다...";
      this.input.rows = 2;
      this.input.placeholder = "질문을 입력하세요";
      this.sendButton.type = "button";
      this.sendButton.textContent = "전송";
      this.privacyNotice.style.display = "none";
    }

    async mount() {
      if (this.initialized) return;
      this.initialized = true;

      const style = document.createElement("style");
      style.textContent = buildStyles(
        this.options.theme?.primaryColor || "#2563eb",
        this.options.theme?.textColor || "#0f172a",
        this.options.theme?.backgroundColor || "#ffffff",
      );
      this.shadow.appendChild(style);
      this.shadow.appendChild(this.root);

      const header = createElement(document, "div", "ieum-header");
      const closeButton = createElement(document, "button", "ieum-close");
      closeButton.type = "button";
      closeButton.textContent = "×";

      const welcome = createElement(document, "div", "ieum-welcome");
      welcome.appendChild(this.welcomeText);
      welcome.appendChild(this.afterHoursBox);
      welcome.appendChild(this.quickActionsWrap);

      const inputWrap = createElement(document, "div", "ieum-input-wrap");
      inputWrap.appendChild(this.input);
      inputWrap.appendChild(this.sendButton);

      header.appendChild(this.headerTitle);
      header.appendChild(closeButton);

      this.panel.appendChild(header);
      this.panel.appendChild(welcome);
      this.panel.appendChild(this.messagesWrap);
      this.panel.appendChild(this.loadingRow);
      this.panel.appendChild(inputWrap);
      this.panel.appendChild(this.privacyNotice);

      this.root.appendChild(this.panel);
      this.root.appendChild(this.launcherButton);
      document.body.appendChild(this.host);

      this.launcherButton.addEventListener("click", () => this.togglePanel());
      closeButton.addEventListener("click", () => this.setOpen(false));
      this.sendButton.addEventListener("click", () => void this.sendCurrentInput());
      this.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void this.sendCurrentInput();
        }
      });

      await this.loadConfig();

      if (this.options.openOnLoad) {
        this.setOpen(true);
      }
    }

    async loadConfig() {
      try {
        this.config = await this.api.getConfig(this.options.chatbotId);
        this.headerTitle.textContent = this.options.title || this.config.chatbotName;
        this.welcomeText.textContent =
          this.options.welcomeMessage ||
          this.config.welcomeMessage ||
          "안내를 시작할 준비가 되었습니다.";

        const primaryColor = this.options.theme?.primaryColor || this.config.theme?.primaryColor;
        if (primaryColor) {
          this.launcherButton.style.background = primaryColor;
          this.sendButton.style.background = primaryColor;
        }

        if (this.config.privacyNotice) {
          this.privacyNotice.textContent = this.config.privacyNotice;
          this.privacyNotice.style.display = "block";
        }

        if (this.config.operatingHours?.isAfterHours && this.config.operatingHours?.message) {
          this.afterHoursBox.textContent = this.config.operatingHours.message;
          this.afterHoursBox.style.display = "block";
        } else {
          this.afterHoursBox.style.display = "none";
        }

        this.renderQuickActions(this.config.quickActions || []);

        if (this.config.runtime?.chatEndpoint) {
          this.chatEndpoint = this.config.runtime.chatEndpoint;
        }
        if (this.config.runtime?.chatStreamEndpoint) {
          this.chatStreamEndpoint = this.config.runtime.chatStreamEndpoint;
        }

        this.sseEnabled =
          readBoolean(this.config.runtime?.sseEnabled) === true ||
          this.config.runtime?.streamingMode === "sse_preferred";
      } catch (error) {
        console.error("[IEUMBOTWidget] Widget config initialization failed", error);
        this.pushMessage({
          id: `sys_${Date.now()}`,
          role: "system",
          text: "초기 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          timestamp: Date.now(),
        });
      }
    }

    renderQuickActions(actions) {
      this.quickActionsWrap.innerHTML = "";
      const visibleActions = actions.filter((item) => item.displayLocation === "welcome").slice(0, 6);

      for (const action of visibleActions) {
        const button = createElement(document, "button", "ieum-quick-action");
        button.type = "button";
        button.textContent = action.label;
        button.title = action.label;
        button.addEventListener("click", () => {
          if (action.actionType === "link" && action.url) {
            window.open(action.url, "_blank", "noopener,noreferrer");
            return;
          }
          this.input.value = action.payload?.trim() || action.label;
          void this.sendCurrentInput();
        });
        this.quickActionsWrap.appendChild(button);
      }
    }

    setOpen(nextOpen) {
      this.open = nextOpen;
      if (nextOpen) {
        this.panel.classList.add("open");
        this.launcherButton.style.display = "none";
        this.input.focus();
        this.scrollMessagesToBottom();
        return;
      }

      this.panel.classList.remove("open");
      this.launcherButton.style.display = "inline-flex";
      this.launcherButton.style.alignItems = "center";
      this.launcherButton.style.justifyContent = "center";
    }

    togglePanel() {
      this.setOpen(!this.open);
    }

    pushMessage(message) {
      this.messages.push(message);
      this.renderMessages();
    }

    updateMessage(messageId, patch) {
      const index = this.messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      this.messages[index] = { ...this.messages[index], ...patch };
      this.renderMessages();
    }

    removeMessage(messageId) {
      this.messages = this.messages.filter((message) => message.id !== messageId);
      this.renderMessages();
    }

    renderMessages() {
      this.messagesWrap.innerHTML = "";

      for (const message of this.messages) {
        const row = createElement(document, "div", `ieum-message ${message.role}`);
        const bubble = createElement(document, "div", "ieum-bubble");
        bubble.textContent = message.text;
        row.appendChild(bubble);

        if (message.role === "assistant") {
          const outcomeNote = getOutcomeNote(message.outcome);
          if (outcomeNote) {
            const note = createElement(document, "div", "ieum-outcome-note");
            note.textContent = outcomeNote;
            bubble.appendChild(note);
          }

          if (message.citations && message.citations.length > 0) {
            const citations = createElement(document, "div", "ieum-citations");
            const title = createElement(document, "div", "ieum-citations-title");
            title.textContent = "출처";
            citations.appendChild(title);

            for (const item of message.citations.slice(0, 5)) {
              const citation = createElement(document, "div", "ieum-citation");
              citation.textContent = formatCitation(item);
              citations.appendChild(citation);
            }

            bubble.appendChild(citations);
          }
        }

        this.messagesWrap.appendChild(row);
      }

      if (this.lastFailedQuestion) {
        const row = createElement(document, "div", "ieum-message system");
        const retryButton = createElement(document, "button", "ieum-quick-action");
        retryButton.type = "button";
        retryButton.textContent = "다시 시도";
        retryButton.addEventListener("click", () => {
          if (!this.lastFailedQuestion) return;
          this.input.value = this.lastFailedQuestion;
          void this.sendCurrentInput();
        });
        row.appendChild(retryButton);
        this.messagesWrap.appendChild(row);
      }

      this.scrollMessagesToBottom();
    }

    scrollMessagesToBottom() {
      requestAnimationFrame(() => {
        this.messagesWrap.scrollTop = this.messagesWrap.scrollHeight;
      });
    }

    setSending(nextSending) {
      this.sending = nextSending;
      this.sendButton.disabled = nextSending;
      this.input.disabled = nextSending;
      this.loadingRow.style.display = nextSending ? "block" : "none";
      this.launcherButton.disabled = nextSending;
    }

    async sendCurrentInput() {
      if (this.sending) return;
      const question = this.input.value.trim();
      if (!question) return;

      this.lastFailedQuestion = null;
      this.input.value = "";
      this.pushMessage({
        id: `u_${Date.now()}`,
        role: "user",
        text: question,
        timestamp: Date.now(),
      });
      this.setSending(true);

      if (this.sseEnabled && (await this.trySendWithSse(question))) {
        this.setSending(false);
        this.input.focus();
        return;
      }

      try {
        const response = await this.api.sendChat(
          {
            chatbotId: this.options.chatbotId,
            question,
            topK: this.options.topK || 8,
            sessionToken: this.sessionToken,
            sourceUrl: this.options.sourceUrl || window.location.href,
          },
          this.chatEndpoint,
        );
        this.handleAssistantResponse(response);
      } catch (error) {
        console.error("[IEUMBOTWidget] Widget chat request failed", error);
        this.lastFailedQuestion = question;
        this.pushMessage({
          id: `sys_${Date.now()}`,
          role: "system",
          text: "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          timestamp: Date.now(),
        });
      } finally {
        this.setSending(false);
        this.input.focus();
      }
    }

    async trySendWithSse(question) {
      const messageId = `a_stream_${Date.now()}`;
      let streamError = false;
      let streamErrorMessage = "스트리밍 연결 오류로 일반 모드로 전환합니다.";
      let outcome = "answered";
      let citations = [];
      let text = "";
      let receivedDelta = false;

      this.pushMessage({
        id: messageId,
        role: "assistant",
        text: "",
        timestamp: Date.now(),
      });

      const onEvent = (event) => {
        const data = event.data || {};

        if (event.event === "message_delta") {
          const delta = readString(data.delta) || "";
          text += delta;
          if (delta) {
            receivedDelta = true;
          }
          this.updateMessage(messageId, { text });
          return;
        }

        if (event.event === "message_complete") {
          outcome = readString(data.outcome) || outcome;
          receivedDelta = true;
          this.updateMessage(messageId, { outcome, text: text || " " });
          return;
        }

        if (event.event === "fallback" || event.event === "escalation") {
          outcome = readString(data.outcome) || (event.event === "escalation" ? "escalate" : "insufficient_evidence");
          text = readString(data.message) || "";
          receivedDelta = true;
          this.updateMessage(messageId, { text, outcome });
          return;
        }

        if (event.event === "citations") {
          citations = readArray(data.items);
          this.updateMessage(messageId, { citations });
          return;
        }

        if (event.event === "error") {
          streamError = true;
          streamErrorMessage = readString(data.message) || streamErrorMessage;
          return;
        }

        if (event.event === "done") {
          const nextSessionToken = readString(data.sessionToken);
          if (nextSessionToken) {
            this.sessionToken = nextSessionToken;
          }
        }
      };

      try {
        await this.api.streamChat(
          {
            chatbotId: this.options.chatbotId,
            question,
            topK: this.options.topK || 8,
            sessionToken: this.sessionToken,
            sourceUrl: this.options.sourceUrl || window.location.href,
          },
          onEvent,
          this.chatStreamEndpoint,
        );

        if (streamError) {
          throw new Error(streamErrorMessage);
        }

        if (text.trim()) {
          this.updateMessage(messageId, { text, outcome, citations });
        } else {
          this.updateMessage(messageId, {
            text: "요청을 처리하지 못했습니다.",
            outcome: "insufficient_evidence",
          });
        }
        return true;
      } catch (error) {
        console.error("[IEUMBOTWidget] Widget SSE request failed", error);
        if (!receivedDelta) {
          this.removeMessage(messageId);
          return false;
        }

        this.updateMessage(messageId, {
          text: text || "응답 수신 중 연결이 종료되었습니다. 잠시 후 다시 시도해 주세요.",
          outcome,
          citations,
        });
        this.lastFailedQuestion = question;
        return true;
      }
    }

    handleAssistantResponse(response) {
      const nextSessionToken = response.trace?.messages?.sessionToken;
      if (typeof nextSessionToken === "string") {
        this.sessionToken = nextSessionToken;
      }

      const answerText =
        response.answer?.text?.trim() ||
        "안내 가능한 답변을 생성하지 못했습니다.";

      this.pushMessage({
        id: `a_${response.requestId}`,
        role: "assistant",
        text: answerText,
        outcome: response.outcome,
        citations: Array.isArray(response.citations) ? response.citations : [],
        timestamp: Date.now(),
      });
    }
  }

  async function initWidget(options) {
    if (!options || !options.chatbotId) {
      throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");
    }

    const identity = `${options.chatbotId}:${resolveApiBaseUrl(options.apiBaseUrl)}`;
    if (initializedWidgets.has(identity)) {
      return;
    }

    const app = new WidgetApp(options);
    await app.mount();
    initializedWidgets.add(identity);
  }

  window.IEUMBOTWidget = { init: initWidget };

  const currentScript = document.currentScript;
  if (currentScript) {
    const chatbotId = currentScript.getAttribute("data-chatbot-id");

    if (chatbotId) {
      void initWidget({
        chatbotId,
        apiBaseUrl: currentScript.getAttribute("data-api-base-url") || undefined,
        openOnLoad: currentScript.getAttribute("data-open-on-load") === "true",
      });
    }
  }
})();
