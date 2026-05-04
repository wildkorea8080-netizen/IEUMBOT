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

type LauncherIconName = "chat" | "heart" | "love-chat" | "custom" | "shield" | "leaf" | "spark";

const LOVE_CHAT_ICON_SRC = "/widget-icons/love-chat-icons.png";

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderLauncherImage(url: string): string {
  return `<img class="ieum-launcher-image" src="${escapeHtmlAttribute(url.trim())}" alt="" aria-hidden="true" />`;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  return element;
}

function createIconSvg(name: LauncherIconName | "send" | "minimize" | "close", customIconUrl?: string | null): string {
  if (name === "custom" && customIconUrl?.trim()) {
    return renderLauncherImage(customIconUrl);
  }
  if (name === "love-chat") {
    return renderLauncherImage(LOVE_CHAT_ICON_SRC);
  }
  if (name === "heart") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19.5 12.57 12 20l-7.5-7.43a4.95 4.95 0 0 1 0-7 4.95 4.95 0 0 1 7 0L12 6l.5-.43a4.95 4.95 0 0 1 7 7Z"/>
      </svg>
    `;
  }
  if (name === "shield") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3 5 6v6c0 5 3.5 7.7 7 9 3.5-1.3 7-4 7-9V6l-7-3Z"/>
        <path d="m9.5 12 1.7 1.7L14.8 10"/>
      </svg>
    `;
  }
  if (name === "leaf") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 20c5 0 9-4 9-9V4h-7c-5 0-9 4-9 9 0 4 3 7 7 7Z"/>
        <path d="M8 16c2-3 5-5 9-6"/>
      </svg>
    `;
  }
  if (name === "spark") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/>
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>
        <path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/>
      </svg>
    `;
  }
  if (name === "send") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 2 11 13"/>
        <path d="m22 2-7 20-4-9-9-4Z"/>
      </svg>
    `;
  }
  if (name === "minimize") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"/>
      </svg>
    `;
  }
  if (name === "close") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6 6 18"/>
        <path d="m6 6 12 12"/>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7 10h10"/>
      <path d="M7 14h6"/>
      <path d="M21 12a8.96 8.96 0 0 1-2.64 6.36A9 9 0 1 1 21 12Z"/>
      <path d="m15 19 3.5 3.5"/>
    </svg>
  `;
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
  return Array.isArray(value) ? (value as ChatCitation[]) : [];
}

function getFriendlyOutcomeLabel(outcome?: string): string | null {
  if (!outcome || outcome === "answered") return null;
  if (outcome === "insufficient_evidence") return "확인 가능한 참고 내용이 부족해 일반 안내로 전환했습니다.";
  if (outcome === "restricted") return "직접 안내가 어려운 질문이라 안전한 범위에서만 답변합니다.";
  if (outcome === "conflict") return "근거 확인이 더 필요한 질문입니다.";
  if (outcome === "escalate") return "추가 확인이 필요한 내용으로 상담 연결이 권장됩니다.";
  return null;
}

function toCitationText(citation: ChatCitation): string {
  const name = citation.documentName?.trim() || "출처";
  const page = citation.pageNumber ? `p.${citation.pageNumber}` : null;
  const section = citation.sectionTitle?.trim() || null;
  const url = citation.sourceUrl?.trim() || null;
  const parts = [name];

  if (page) parts.push(page);
  if (section && section !== name && section !== url) parts.push(section);
  if (url) parts.push(url);

  return parts.join(" | ");
}

function getInstitutionLabel(config: WidgetPublicConfig | null, options: WidgetInitOptions): string {
  return options.title?.trim() || config?.institutionName?.trim() || config?.chatbotName?.trim() || "기관";
}

function headerDisplayName(config: WidgetPublicConfig | null, options: WidgetInitOptions): string {
  const preferred = options.title?.trim() || config?.chatbotName?.trim() || getInstitutionLabel(config, options);
  return preferred.startsWith("AI 챗봇") ? preferred : `AI 챗봇 ${preferred}`;
}

function buildInitialMessage(config: WidgetPublicConfig | null, options: WidgetInitOptions): string {
  if (options.welcomeMessage?.trim()) return options.welcomeMessage.trim();
  if (config?.introMessage?.trim()) return config.introMessage.trim();
  if (config?.welcomeMessage?.trim()) return config.welcomeMessage.trim();
  const preferred = getInstitutionLabel(config, options);
  return `안녕하세요\n${preferred} AI 챗봇입니다.\n\n궁금하신 내용을 입력해주시면\n빠르게 안내해드리겠습니다.`;
}

function getPresetGradient(preset?: string | null): string {
  if (preset === "forest") return "linear-gradient(135deg, #166534, #0f766e)";
  if (preset === "sky") return "linear-gradient(135deg, #1d4ed8, #0284c7)";
  if (preset === "civic") return "linear-gradient(135deg, #1e40af, #0f766e)";
  if (preset === "sunset") return "linear-gradient(135deg, #b45309, #ea580c)";
  return "linear-gradient(135deg, #2563EB, #22C55E)";
}

function getLauncherIcon(config: WidgetPublicConfig | null): LauncherIconName {
  const icon = config?.theme?.launcherIcon;
  if (icon === "custom" && config?.theme?.launcherIconUrl?.trim()) return "custom";
  if (icon === "love-chat") return icon;
  if (icon === "heart" || icon === "shield" || icon === "leaf" || icon === "spark") return icon;
  return "chat";
}

function isImageLauncherIcon(icon: LauncherIconName, customIconUrl?: string | null): boolean {
  return icon === "love-chat" || (icon === "custom" && !!customIconUrl?.trim());
}

function getLauncherHoverMessage(config: WidgetPublicConfig | null, options: WidgetInitOptions): string | null {
  const explicit = config?.launcherHoverMessage?.trim();
  if (explicit) return explicit;
  const institution = getInstitutionLabel(config, options);
  return `AI챗봇 ${institution}예요. 무엇을 도와드릴까요?`;
}

function buildScopedStyles(primaryGradient: string): string {
  return `
:host { all: initial; }
.ieum-root, .ieum-root * {
  box-sizing: border-box;
  font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", Arial, sans-serif;
  letter-spacing: -0.01em;
}
.ieum-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147480000;
  color: #0f172a;
}
.ieum-launcher-wrap {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}
.ieum-launcher-tip {
  width: min(340px, calc(100vw - 48px));
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14);
  padding: 12px 14px 12px 16px;
  display: none;
  align-items: flex-start;
  gap: 10px;
}
.ieum-launcher-tip.visible {
  display: flex;
  animation: ieum-tooltip-in .18s ease;
}
.ieum-launcher-tip-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: #0f172a;
  white-space: pre-wrap;
  word-break: keep-all;
}
.ieum-launcher-tip-close {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 9999px;
  background: #f1f5f9;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
}
.ieum-launcher-tip-close svg {
  width: 14px;
  height: 14px;
}
.ieum-floating {
  width: 64px;
  height: 64px;
  border: none;
  border-radius: 9999px;
  background: ${primaryGradient};
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 14px 30px rgba(37, 99, 235, 0.28);
  transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.ieum-floating.ieum-floating-loading {
  opacity: 0;
  pointer-events: none;
  transform: scale(.96);
}
.ieum-floating:hover {
  transform: scale(1.05);
  box-shadow: 0 20px 36px rgba(15, 23, 42, 0.28);
}
.ieum-floating.ieum-floating-image {
  background: transparent;
  box-shadow: none;
  padding: 0;
}
.ieum-floating.ieum-floating-image:hover {
  box-shadow: none;
}
.ieum-floating .ieum-launcher-image {
  width: 64px;
  height: 64px;
  border-radius: 9999px;
  object-fit: contain;
  display: block;
  background: transparent;
}
.ieum-floating.ieum-floating-image .ieum-launcher-image {
  filter: drop-shadow(0 14px 24px rgba(15, 23, 42, 0.18));
}
.ieum-floating svg,
.ieum-header-icon svg,
.ieum-header-icon img,
.ieum-header-button svg,
.ieum-send svg {
  width: 26px;
  height: 26px;
}
.ieum-header-icon img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 9999px;
}
.ieum-panel {
  position: absolute;
  right: 0;
  bottom: 0;
  width: min(340px, calc(100vw - 24px));
  height: min(520px, calc(100vh - 24px));
  border-radius: 16px;
  background: #ffffff;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: translateY(20px);
  pointer-events: none;
  transition: opacity .22s ease, transform .22s ease;
}
.ieum-panel.open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.ieum-header {
  min-height: 60px;
  padding: 12px 16px;
  background: ${primaryGradient};
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ieum-header-main { display:flex; align-items:center; gap:10px; min-width:0; }
.ieum-header-icon {
  width: 34px; height: 34px; border-radius: 9999px; background: rgba(255,255,255,.16);
  display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto;
}
.ieum-title {
  font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ieum-header-actions { display:flex; align-items:center; gap:6px; }
.ieum-header-button {
  width:30px; height:30px; border:none; border-radius:9999px; background:rgba(255,255,255,.15); color:#fff;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
}
.ieum-header-button:hover { background: rgba(255,255,255,.24); }
.ieum-messages {
  flex:1; padding:16px; background:#f8fafc; overflow-y:auto; display:flex; flex-direction:column; gap:10px;
}
.ieum-banner {
  margin: 16px 16px 0; border:1px solid rgba(37,99,235,.12); border-radius:14px; padding:12px 14px;
  background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(239,246,255,.9));
  box-shadow: 0 4px 16px rgba(15,23,42,.05);
}
.ieum-banner-title { font-size:12px; font-weight:700; color:#1e3a8a; }
.ieum-banner-description { margin-top:4px; font-size:12px; line-height:1.5; color:#475569; white-space:pre-wrap; }
.ieum-starter-questions, .ieum-quick-actions {
  display:flex; flex-wrap:wrap; gap:8px; padding:0 16px 12px; background:#f8fafc;
}
.ieum-starter-question, .ieum-quick-action {
  border:1px solid #dbe4f0; background:#fff; color:#0f172a; padding:10px 12px; cursor:pointer;
  box-shadow:0 2px 8px rgba(15,23,42,.04);
}
.ieum-starter-question {
  width:100%; border-radius:14px; text-align:left; font-size:12px; line-height:1.45;
}
.ieum-quick-action {
  border-radius:9999px; color:#1e3a8a; padding:8px 12px; font-size:12px; font-weight:600; box-shadow:0 1px 3px rgba(15,23,42,.04);
}
.ieum-starter-question:hover, .ieum-quick-action:hover { border-color:#93c5fd; background:#eff6ff; }
.ieum-message { display:flex; width:100%; animation: ieum-message-in .2s ease; }
.ieum-message.user { justify-content:flex-end; }
.ieum-message.assistant, .ieum-message.system { justify-content:flex-start; }
.ieum-bubble {
  max-width:75%; border-radius:16px; padding:12px 14px; font-size:13px; line-height:1.6; white-space:pre-wrap; word-break:break-word;
}
.ieum-message.assistant .ieum-bubble, .ieum-message.system .ieum-bubble {
  background:#fff; color:#0f172a; box-shadow:0 2px 6px rgba(0,0,0,.05);
}
.ieum-message.user .ieum-bubble { background:#2563eb; color:#fff; }
.ieum-outcome-note, .ieum-citations { margin-top:8px; padding-top:8px; border-top:1px dashed #dbe4f0; }
.ieum-outcome-note, .ieum-citations-title, .ieum-citation { font-size:11px; color:#475569; }
.ieum-citations-title { margin-bottom:4px; font-weight:700; }
.ieum-citation { line-height:1.45; margin-bottom:3px; }
.ieum-loading {
  display:none; align-self:flex-start; max-width:75%; margin:0 16px 12px; border-radius:16px; padding:12px 14px;
  background:#fff; color:#64748b; box-shadow:0 2px 6px rgba(0,0,0,.05); font-size:18px; line-height:1;
}
.ieum-loading.active { display:inline-flex; gap:4px; }
.ieum-loading-dot { width:5px; height:5px; border-radius:9999px; background:#94a3b8; animation: ieum-dot 1s infinite ease-in-out; }
.ieum-loading-dot:nth-child(2) { animation-delay:.15s; }
.ieum-loading-dot:nth-child(3) { animation-delay:.3s; }
.ieum-input-wrap {
  min-height:64px; border-top:1px solid #e5e7eb; padding:8px 12px; display:flex; align-items:center; gap:10px; background:#fff;
}
.ieum-input {
  flex:1; min-width:0; height:44px; border-radius:9999px; border:1px solid #e5e7eb; padding:10px 14px; font-size:13px; color:#0f172a; outline:none;
}
.ieum-input::placeholder { color:#94a3b8; }
.ieum-input:focus { border-color:#93c5fd; box-shadow:0 0 0 4px rgba(37,99,235,.08); }
.ieum-send {
  width:42px; height:42px; border:none; border-radius:9999px; background:#2563eb; color:#fff; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:filter .16s ease;
}
.ieum-send:hover { filter: brightness(1.1); }
.ieum-send:disabled, .ieum-floating:disabled { opacity:.65; cursor:default; }
.ieum-footer { border-top:1px solid #eef2f7; padding:8px 12px; background:#f8fafc; font-size:11px; color:#64748b; line-height:1.45; }
@keyframes ieum-dot { 0%,80%,100%{transform:translateY(0);opacity:.45} 40%{transform:translateY(-3px);opacity:1} }
@keyframes ieum-message-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes ieum-tooltip-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@media (max-width: 640px) {
  .ieum-root { right:8px; left:8px; bottom:8px; }
  .ieum-panel { width:100%; height:min(520px, calc(100vh - 16px)); }
  .ieum-bubble { max-width:84%; }
  .ieum-launcher-tip { width: calc(100vw - 32px); }
}
`;
}

export class IeumWidgetApp {
  private readonly options: WidgetInitOptions;
  private readonly api: WidgetApiClient;
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly root: HTMLDivElement;
  private readonly launcherWrap: HTMLDivElement;
  private readonly launcherTip: HTMLDivElement;
  private readonly launcherTipText: HTMLDivElement;
  private readonly launcherTipClose: HTMLButtonElement;
  private readonly floatingButton: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly titleNode: HTMLDivElement;
  private readonly headerIconNode: HTMLDivElement;
  private readonly bannerWrap: HTMLDivElement;
  private readonly starterQuestionsWrap: HTMLDivElement;
  private readonly quickActionsWrap: HTMLDivElement;
  private readonly messagesWrap: HTMLDivElement;
  private readonly loadingRow: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly footerNotice: HTMLDivElement;

  private initialized = false;
  private open = false;
  private sending = false;
  private launcherTipDismissed = false;
  private launcherHoverMessage = "";
  private launcherTipStorageKey = "";
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
    this.host.setAttribute("data-ieumbot-chatbot-id", options.chatbotId);
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.root = createElement(document, "div", "ieum-root");
    this.launcherWrap = createElement(document, "div", "ieum-launcher-wrap");
    this.launcherTip = createElement(document, "div", "ieum-launcher-tip");
    this.launcherTipText = createElement(document, "div", "ieum-launcher-tip-text");
    this.launcherTipClose = createElement(document, "button", "ieum-launcher-tip-close");
    this.floatingButton = createElement(document, "button", "ieum-floating");
    this.panel = createElement(document, "div", "ieum-panel");
    this.titleNode = createElement(document, "div", "ieum-title");
    this.headerIconNode = createElement(document, "div", "ieum-header-icon");
    this.bannerWrap = createElement(document, "div", "ieum-banner");
    this.starterQuestionsWrap = createElement(document, "div", "ieum-starter-questions");
    this.quickActionsWrap = createElement(document, "div", "ieum-quick-actions");
    this.messagesWrap = createElement(document, "div", "ieum-messages");
    this.loadingRow = createElement(document, "div", "ieum-loading");
    this.input = createElement(document, "input", "ieum-input");
    this.sendButton = createElement(document, "button", "ieum-send");
    this.footerNotice = createElement(document, "div", "ieum-footer");

    this.launcherTipClose.type = "button";
    this.launcherTipClose.setAttribute("aria-label", "안내 닫기");
    this.launcherTipClose.innerHTML = createIconSvg("close");
    this.launcherTip.appendChild(this.launcherTipText);
    this.launcherTip.appendChild(this.launcherTipClose);

    this.floatingButton.type = "button";
    this.floatingButton.title = options.launcherLabel ?? "챗봇 열기";
    this.floatingButton.setAttribute("aria-label", options.launcherLabel ?? "챗봇 열기");
    this.floatingButton.replaceChildren();
    this.floatingButton.innerHTML = createIconSvg("chat");
    this.floatingButton.classList.remove("ieum-floating-image");
    this.floatingButton.classList.add("ieum-floating-loading");

    this.titleNode.textContent = headerDisplayName(null, options);
    this.loadingRow.innerHTML = `
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
    `;
    this.input.placeholder = "무엇을 도와드릴까요?";
    this.sendButton.type = "button";
    this.sendButton.setAttribute("aria-label", "메시지 전송");
    this.sendButton.innerHTML = createIconSvg("send");
    this.footerNotice.style.display = "none";
  }

  async mount() {
    if (this.initialized) return;
    this.initialized = true;

    const style = document.createElement("style");
    style.textContent = buildScopedStyles(getPresetGradient(this.options.theme?.primaryColor ?? null));
    this.shadow.appendChild(style);
    this.shadow.appendChild(this.root);

    const header = createElement(document, "div", "ieum-header");
    const headerMain = createElement(document, "div", "ieum-header-main");
    const headerActions = createElement(document, "div", "ieum-header-actions");
    const minimizeButton = createElement(document, "button", "ieum-header-button");
    const closeButton = createElement(document, "button", "ieum-header-button");
    const inputWrap = createElement(document, "div", "ieum-input-wrap");

    this.headerIconNode.innerHTML = createIconSvg("heart");
    minimizeButton.type = "button";
    minimizeButton.title = "최소화";
    minimizeButton.setAttribute("aria-label", "최소화");
    minimizeButton.innerHTML = createIconSvg("minimize");
    closeButton.type = "button";
    closeButton.title = "닫기";
    closeButton.setAttribute("aria-label", "닫기");
    closeButton.innerHTML = createIconSvg("close");

    headerMain.appendChild(this.headerIconNode);
    headerMain.appendChild(this.titleNode);
    headerActions.appendChild(minimizeButton);
    headerActions.appendChild(closeButton);
    header.appendChild(headerMain);
    header.appendChild(headerActions);

    inputWrap.appendChild(this.input);
    inputWrap.appendChild(this.sendButton);

    this.panel.appendChild(header);
    this.panel.appendChild(this.bannerWrap);
    this.panel.appendChild(this.messagesWrap);
    this.panel.appendChild(this.starterQuestionsWrap);
    this.panel.appendChild(this.quickActionsWrap);
    this.panel.appendChild(this.loadingRow);
    this.panel.appendChild(inputWrap);
    this.panel.appendChild(this.footerNotice);

    this.launcherWrap.appendChild(this.launcherTip);
    this.launcherWrap.appendChild(this.floatingButton);

    this.root.appendChild(this.panel);
    this.root.appendChild(this.launcherWrap);
    document.body.appendChild(this.host);

    this.floatingButton.addEventListener("click", () => this.togglePanel());
    this.floatingButton.addEventListener("mouseenter", () => this.showLauncherTip());
    this.floatingButton.addEventListener("focus", () => this.showLauncherTip());
    this.floatingButton.addEventListener("blur", () => this.hideLauncherTip());
    this.launcherTip.addEventListener("mouseenter", () => this.showLauncherTip());
    this.launcherWrap.addEventListener("mouseleave", () => this.hideLauncherTip());
    this.launcherTipClose.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dismissLauncherTip();
    });
    minimizeButton.addEventListener("click", () => this.setOpen(false));
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

  private ensureInitialMessage() {
    if (this.messages.length > 0) return;
    this.pushMessage({
      id: `assistant_welcome_${Date.now()}`,
      role: "assistant",
      text: buildInitialMessage(this.config, this.options),
      timestamp: Date.now(),
    });
    if (this.config?.operatingHours.isAfterHours && this.config.operatingHours.message) {
      this.pushMessage({
        id: `system_after_hours_${Date.now()}`,
        role: "system",
        text: this.config.operatingHours.message,
        timestamp: Date.now(),
      });
    }
  }

  private clearInitialWelcomeForDirectQuestion() {
    if (this.messages.some((message) => message.role === "user")) return;
    const filtered = this.messages.filter((message) => !message.id.startsWith("assistant_welcome_"));
    if (filtered.length === this.messages.length) return;
    this.messages = filtered;
    this.renderMessages();
  }

  private readLauncherTipDismissed() {
    if (!this.launcherTipStorageKey) return false;
    try {
      return window.localStorage.getItem(this.launcherTipStorageKey) === "1";
    } catch {
      return false;
    }
  }

  private dismissLauncherTip() {
    this.launcherTipDismissed = true;
    this.hideLauncherTip();
    if (!this.launcherTipStorageKey) return;
    try {
      window.localStorage.setItem(this.launcherTipStorageKey, "1");
    } catch {
      // ignore storage failures
    }
  }

  private showLauncherTip(options: { respectDismissed?: boolean } = {}) {
    if (this.open || !this.launcherHoverMessage.trim()) return;
    if (options.respectDismissed && this.launcherTipDismissed) return;
    this.launcherTip.classList.add("visible");
  }

  private hideLauncherTip() {
    this.launcherTip.classList.remove("visible");
  }

  private async loadConfig() {
    try {
      this.config = await this.api.getConfig(this.options.chatbotId);
      const style = this.shadow.querySelector("style");
      if (style) {
        style.textContent = buildScopedStyles(getPresetGradient(this.config.theme?.preset));
      }
      this.titleNode.textContent = headerDisplayName(this.config, this.options);
      if (this.config.logoUrl?.trim()) {
        this.headerIconNode.innerHTML = `<img src="${this.config.logoUrl}" alt="기관 로고" />`;
      } else {
        this.headerIconNode.innerHTML = createIconSvg("heart");
      }
      const launcherIcon = getLauncherIcon(this.config);
      const launcherIconUrl = this.config.theme?.launcherIconUrl;
      this.floatingButton.replaceChildren();
      this.floatingButton.innerHTML = createIconSvg(launcherIcon, launcherIconUrl);
      this.floatingButton.classList.toggle("ieum-floating-image", isImageLauncherIcon(launcherIcon, launcherIconUrl));
      this.launcherHoverMessage = getLauncherHoverMessage(this.config, this.options) ?? "";
      this.launcherTipText.textContent = this.launcherHoverMessage;
      this.launcherTipStorageKey = `ieumbot_launcher_tip_dismissed:${this.options.chatbotId}`;
      this.launcherTipDismissed = this.readLauncherTipDismissed();
      if (window.matchMedia("(max-width: 640px)").matches && !this.launcherTipDismissed) {
        this.showLauncherTip({ respectDismissed: true });
      }
      this.renderBanner();
      this.renderStarterQuestions();
      if (this.config.privacyNotice) {
        this.footerNotice.textContent = this.config.privacyNotice;
        this.footerNotice.style.display = "block";
      }
      this.renderQuickActions(this.config.quickActions);
      if (this.config.runtime?.chatEndpoint) this.chatEndpoint = this.config.runtime.chatEndpoint;
      if (this.config.runtime?.chatStreamEndpoint) this.chatStreamEndpoint = this.config.runtime.chatStreamEndpoint;
      this.sseEnabled =
        asBoolean(this.config.runtime?.sseEnabled) === true || this.config.runtime?.streamingMode === "sse_preferred";
      this.ensureInitialMessage();
    } catch {
      this.pushMessage({
        id: `system_load_error_${Date.now()}`,
        role: "system",
        text: "초기 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        timestamp: Date.now(),
      });
    } finally {
      this.floatingButton.classList.remove("ieum-floating-loading");
    }
  }

  private renderBanner() {
    this.bannerWrap.innerHTML = "";
    const title = this.config?.banner?.title?.trim();
    const description = this.config?.banner?.description?.trim();
    if (!title && !description) {
      this.bannerWrap.style.display = "none";
      return;
    }
    this.bannerWrap.style.display = "block";
    if (title) {
      const titleNode = createElement(document, "div", "ieum-banner-title");
      titleNode.textContent = title;
      this.bannerWrap.appendChild(titleNode);
    }
    if (description) {
      const descriptionNode = createElement(document, "div", "ieum-banner-description");
      descriptionNode.textContent = description;
      this.bannerWrap.appendChild(descriptionNode);
    }
  }

  private renderStarterQuestions() {
    this.starterQuestionsWrap.innerHTML = "";
    const items = this.config?.starterQuestions?.filter((item) => item.trim()).slice(0, 4) ?? [];
    if (items.length === 0) {
      this.starterQuestionsWrap.style.display = "none";
      return;
    }
    this.starterQuestionsWrap.style.display = "flex";
    for (const question of items) {
      const button = createElement(document, "button", "ieum-starter-question");
      button.type = "button";
      button.textContent = question;
      button.addEventListener("click", () => {
        this.input.value = question;
        void this.sendCurrentInput();
      });
      this.starterQuestionsWrap.appendChild(button);
    }
  }

  private renderQuickActions(actions: WidgetQuickAction[]) {
    this.quickActionsWrap.innerHTML = "";
    const visible = actions.filter((item) => item.displayLocation === "welcome").slice(0, 6);
    if (visible.length === 0) {
      this.quickActionsWrap.style.display = "none";
      return;
    }
    this.quickActionsWrap.style.display = "flex";
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
      this.hideLauncherTip();
      this.ensureInitialMessage();
      this.panel.classList.add("open");
      this.launcherWrap.style.opacity = "0";
      this.launcherWrap.style.pointerEvents = "none";
      this.input.focus();
      this.scrollMessagesToBottom();
      return;
    }
    this.panel.classList.remove("open");
    this.launcherWrap.style.opacity = "1";
    this.launcherWrap.style.pointerEvents = "auto";
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
    this.starterQuestionsWrap.style.display = this.messages.length <= 1 ? this.starterQuestionsWrap.style.display : "none";
    for (const message of this.messages) {
      const row = createElement(document, "div", `ieum-message ${message.role}`);
      const bubble = createElement(document, "div", "ieum-bubble");
      bubble.textContent = message.text;

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

      row.appendChild(bubble);
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
    this.loadingRow.classList.toggle("active", value);
  }

  private async sendCurrentInput() {
    if (this.sending) return;
    const question = this.input.value.trim();
    if (!question) return;
    this.clearInitialWelcomeForDirectQuestion();

    this.lastFailedQuestion = null;
    this.input.value = "";
    this.pushMessage({
      id: `user_${Date.now()}`,
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
        id: `system_send_error_${Date.now()}`,
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
    const draftMessageId = `assistant_stream_${Date.now()}`;
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
        this.updateMessage(draftMessageId, { outcome: finalOutcome, text: finalText || "..." });
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
        const nextSessionToken = asString(data.sessionToken);
        if (nextSessionToken) this.sessionToken = nextSessionToken;
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
        this.updateMessage(draftMessageId, {
          text: "요청을 처리하지 못했습니다.",
          outcome: "insufficient_evidence",
        });
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
      id: `assistant_${response.requestId}`,
      role: "assistant",
      text: answerText,
      outcome: response.outcome,
      citations: Array.isArray(response.citations) ? response.citations : [],
      timestamp: Date.now(),
    });
  }
}
