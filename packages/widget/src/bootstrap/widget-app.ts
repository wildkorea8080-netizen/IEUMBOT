import { WidgetApiClient } from "../api/client";
import type {
  ChatCitation,
  ChatResponse,
  ChatStreamEvent,
  WidgetInitOptions,
  WidgetPublicConfig,
  WidgetQuickAction,
} from "../types";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  outcome?: string;
  citations?: ChatCitation[];
  timestamp: number;
};

function createElement<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  return element;
}

function getFriendlyOutcomeLabel(outcome?: string): string | null {
  if (!outcome || outcome === "answered") return null;
  if (outcome === "insufficient_evidence") return "확인 가능한 근거가 부족해 정확한 안내가 제한됩니다.";
  if (outcome === "restricted") return "해당 질문은 직접 안내가 제한됩니다.";
  if (outcome === "conflict") return "근거 확인이 더 필요한 문의입니다.";
  if (outcome === "escalate") return "담당 부서 확인이 필요한 문의입니다.";
  return null;
}

function toCitationText(citation: ChatCitation): string {
  const name = citation.documentName ?? "출처";
  const page = citation.pageNumber ? `p.${citation.pageNumber}` : null;
  const section = citation.sectionTitle ?? null;
  const url = citation.sourceUrl ?? null;
  return [name, page, section, url].filter(Boolean).join(" | ");
}

function normalizeApiBaseUrl(value?: string): string {
  if (value && value.trim()) return value.replace(/\/$/, "");
  return `${window.location.origin}/api`;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asCitationArray(value: unknown): ChatCitation[] {
  if (!Array.isArray(value)) return [];
  return value as ChatCitation[];
}

function buildScopedStyles(primaryColor: string, textColor: string, backgroundColor: string): string {
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

export class IeumWidgetApp {
  private readonly options: WidgetInitOptions;
  private readonly api: WidgetApiClient;
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly root: HTMLDivElement;
  private readonly launcherButton: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly headerTitle: HTMLDivElement;
  private readonly welcomeText: HTMLParagraphElement;
  private readonly afterHoursBox: HTMLDivElement;
  private readonly quickActionsWrap: HTMLDivElement;
  private readonly messagesWrap: HTMLDivElement;
  private readonly loadingRow: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly privacyNotice: HTMLDivElement;

  private initialized = false;
  private open = false;
  private sending = false;
  private sessionToken = `widget_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  private config: WidgetPublicConfig | null = null;
  private chatEndpoint = "/chat/messages";
  private chatStreamEndpoint = "/chat/messages/stream";
  private sseEnabled = false;
  private messages: Message[] = [];
  private lastFailedQuestion: string | null = null;

  constructor(options: WidgetInitOptions) {
    this.options = options;
    this.api = new WidgetApiClient(normalizeApiBaseUrl(options.apiBaseUrl));
    this.host = document.createElement("div");
    this.host.setAttribute("data-ieumbot-widget-root", "true");
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

    this.launcherButton.type = "button";
    this.launcherButton.title = options.launcherLabel ?? "채팅 열기";
    this.launcherButton.textContent = "💬";

    this.headerTitle.textContent = options.title ?? "이음봇";
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
    style.textContent = buildScopedStyles(
      this.options.theme?.primaryColor ?? "#2563eb",
      this.options.theme?.textColor ?? "#0f172a",
      this.options.theme?.backgroundColor ?? "#ffffff",
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
    this.input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.sendCurrentInput();
      }
    });

    await this.loadConfig();
    if (this.options.openOnLoad) this.setOpen(true);
  }

  private async loadConfig() {
    try {
      this.config = await this.api.getConfig(this.options.chatbotId);
      this.headerTitle.textContent = this.options.title ?? this.config.chatbotName;
      this.welcomeText.textContent =
        this.options.welcomeMessage ?? this.config.welcomeMessage ?? "안내를 시작할 준비가 되었습니다.";

      const primaryColor = this.options.theme?.primaryColor ?? this.config.theme.primaryColor;
      if (primaryColor) {
        this.launcherButton.style.background = primaryColor;
        this.sendButton.style.background = primaryColor;
      }
      if (this.config.privacyNotice) {
        this.privacyNotice.textContent = this.config.privacyNotice;
        this.privacyNotice.style.display = "block";
      }
      if (this.config.operatingHours.isAfterHours && this.config.operatingHours.message) {
        this.afterHoursBox.textContent = this.config.operatingHours.message;
        this.afterHoursBox.style.display = "block";
      } else {
        this.afterHoursBox.style.display = "none";
      }

      this.renderQuickActions(this.config.quickActions);
      if (this.config.runtime?.chatEndpoint) this.chatEndpoint = this.config.runtime.chatEndpoint;
      if (this.config.runtime?.chatStreamEndpoint) this.chatStreamEndpoint = this.config.runtime.chatStreamEndpoint;
      this.sseEnabled =
        asBoolean(this.config.runtime?.sseEnabled) === true || this.config.runtime?.streamingMode === "sse_preferred";
    } catch {
      this.pushMessage({
        id: `sys_${Date.now()}`,
        role: "system",
        text: "초기 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        timestamp: Date.now(),
      });
    }
  }

  private renderQuickActions(actions: WidgetQuickAction[]) {
    this.quickActionsWrap.innerHTML = "";
    const visible = actions.filter((item) => item.displayLocation === "welcome").slice(0, 6);
    for (const action of visible) {
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

  private setOpen(value: boolean) {
    this.open = value;
    if (value) {
      this.panel.classList.add("open");
      this.launcherButton.style.display = "none";
      this.input.focus();
      this.scrollMessagesToBottom();
    } else {
      this.panel.classList.remove("open");
      this.launcherButton.style.display = "inline-flex";
      this.launcherButton.style.alignItems = "center";
      this.launcherButton.style.justifyContent = "center";
    }
  }

  private togglePanel() {
    this.setOpen(!this.open);
  }

  private pushMessage(message: Message) {
    this.messages.push(message);
    this.renderMessages();
  }

  private updateMessage(messageId: string, patch: Partial<Message>) {
    const index = this.messages.findIndex((item) => item.id === messageId);
    if (index < 0) return;
    this.messages[index] = { ...this.messages[index], ...patch };
    this.renderMessages();
  }

  private removeMessage(messageId: string) {
    this.messages = this.messages.filter((item) => item.id !== messageId);
    this.renderMessages();
  }

  private renderMessages() {
    this.messagesWrap.innerHTML = "";
    for (const message of this.messages) {
      const row = createElement(document, "div", `ieum-message ${message.role}`);
      const bubble = createElement(document, "div", "ieum-bubble");
      bubble.textContent = message.text;
      row.appendChild(bubble);

      if (message.role === "assistant") {
        const outcomeText = getFriendlyOutcomeLabel(message.outcome);
        if (outcomeText) {
          const note = createElement(document, "div", "ieum-outcome-note");
          note.textContent = outcomeText;
          bubble.appendChild(note);
        }
        if (message.citations && message.citations.length > 0) {
          const citationWrap = createElement(document, "div", "ieum-citations");
          const title = createElement(document, "div", "ieum-citations-title");
          title.textContent = "출처";
          citationWrap.appendChild(title);
          for (const citation of message.citations.slice(0, 5)) {
            const line = createElement(document, "div", "ieum-citation");
            line.textContent = toCitationText(citation);
            citationWrap.appendChild(line);
          }
          bubble.appendChild(citationWrap);
        }
      }
      this.messagesWrap.appendChild(row);
    }

    if (this.lastFailedQuestion) {
      const retryRow = createElement(document, "div", "ieum-message system");
      const retryButton = createElement(document, "button", "ieum-quick-action");
      retryButton.type = "button";
      retryButton.textContent = "다시 시도";
      retryButton.addEventListener("click", () => {
        if (!this.lastFailedQuestion) return;
        this.input.value = this.lastFailedQuestion;
        void this.sendCurrentInput();
      });
      retryRow.appendChild(retryButton);
      this.messagesWrap.appendChild(retryRow);
    }
    this.scrollMessagesToBottom();
  }

  private scrollMessagesToBottom() {
    requestAnimationFrame(() => {
      this.messagesWrap.scrollTop = this.messagesWrap.scrollHeight;
    });
  }

  private setSending(value: boolean) {
    this.sending = value;
    this.sendButton.disabled = value;
    this.input.disabled = value;
    this.loadingRow.style.display = value ? "block" : "none";
    this.launcherButton.disabled = value;
  }

  private async sendCurrentInput() {
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

    if (this.sseEnabled) {
      const success = await this.trySendWithSse(question);
      if (success) {
        this.setSending(false);
        this.input.focus();
        return;
      }
    }

    try {
      const response = await this.api.sendChat(
        {
          chatbotId: this.options.chatbotId,
          question,
          topK: this.options.topK ?? 8,
          sessionToken: this.sessionToken,
          sourceUrl: this.options.sourceUrl ?? window.location.href,
        },
        this.chatEndpoint,
      );
      this.handleAssistantResponse(response);
    } catch {
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

  private async trySendWithSse(question: string): Promise<boolean> {
    const draftMessageId = `a_stream_${Date.now()}`;
    let streamFailed = false;
    let streamErrorMessage = "스트리밍 연결 오류로 일반 모드로 전환합니다.";
    let finalOutcome = "answered";
    let finalCitations: ChatCitation[] = [];
    let finalText = "";
    let receivedVisiblePayload = false;

    this.pushMessage({
      id: draftMessageId,
      role: "assistant",
      text: "",
      timestamp: Date.now(),
    });

    const onEvent = (event: ChatStreamEvent) => {
      const data = event.data ?? {};
      if (event.event === "message_delta") {
        const delta = asString(data.delta) ?? "";
        finalText += delta;
        if (delta) receivedVisiblePayload = true;
        this.updateMessage(draftMessageId, { text: finalText });
        return;
      }
      if (event.event === "message_complete") {
        finalOutcome = asString(data.outcome) ?? finalOutcome;
        receivedVisiblePayload = true;
        this.updateMessage(draftMessageId, { outcome: finalOutcome, text: finalText || " " });
        return;
      }
      if (event.event === "fallback" || event.event === "escalation") {
        finalOutcome = asString(data.outcome) ?? (event.event === "escalation" ? "escalate" : "insufficient_evidence");
        finalText = asString(data.message) ?? "";
        receivedVisiblePayload = true;
        this.updateMessage(draftMessageId, { text: finalText, outcome: finalOutcome });
        return;
      }
      if (event.event === "citations") {
        finalCitations = asCitationArray(data.items);
        this.updateMessage(draftMessageId, { citations: finalCitations });
        return;
      }
      if (event.event === "error") {
        streamFailed = true;
        streamErrorMessage = asString(data.message) ?? streamErrorMessage;
        return;
      }
      if (event.event === "done") {
        const sessionToken = asString(data.sessionToken);
        if (sessionToken) this.sessionToken = sessionToken;
      }
    };

    try {
      await this.api.streamChat(
        {
          chatbotId: this.options.chatbotId,
          question,
          topK: this.options.topK ?? 8,
          sessionToken: this.sessionToken,
          sourceUrl: this.options.sourceUrl ?? window.location.href,
        },
        onEvent,
        this.chatStreamEndpoint,
      );
      if (streamFailed) throw new Error(streamErrorMessage);
      if (!finalText.trim()) {
        this.updateMessage(draftMessageId, { text: "요청을 처리하지 못했습니다.", outcome: "insufficient_evidence" });
      } else {
        this.updateMessage(draftMessageId, {
          text: finalText,
          outcome: finalOutcome,
          citations: finalCitations,
        });
      }
      return true;
    } catch {
      if (receivedVisiblePayload) {
        this.updateMessage(draftMessageId, {
          text: finalText || "응답 수신 중 연결이 종료되었습니다. 잠시 후 다시 시도해 주세요.",
          outcome: finalOutcome,
          citations: finalCitations,
        });
        this.lastFailedQuestion = question;
        return true;
      }
      this.removeMessage(draftMessageId);
      return false;
    }
  }

  private handleAssistantResponse(response: ChatResponse) {
    const nextSessionToken = response.trace?.messages?.sessionToken;
    if (nextSessionToken && typeof nextSessionToken === "string") {
      this.sessionToken = nextSessionToken;
    }
    const answerText = response.answer?.text?.trim() || "안내 가능한 답변을 생성하지 못했습니다.";
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
