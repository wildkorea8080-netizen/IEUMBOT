import { WidgetApiClient } from "../api/client";
import type {
  ChatCitation,
  ChatResponse,
  ChatStreamEvent,
  ListResponse,
  StructuredResponse,
  TextResponse,
  ViewResponse,
  WidgetInitOptions,
  WidgetPublicConfig,
  WidgetQuickAction,
} from "../types";

type ConditionalAction = {
  type: "link" | "video" | "file" | "contact";
  label: string;
  value: string;
  description?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  outcome?: string;
  citations?: ChatCitation[];
  followUpQuestions?: string[];
  conditionalActions?: ConditionalAction[];
  structuredResponse?: StructuredResponse | null;
  timestamp: number;
};

type LauncherIconName = "chat" | "heart" | "love-chat" | "custom" | "shield" | "leaf" | "spark";

const LOVE_CHAT_ICON_SRC = "/widget-icons/love-chat-icons.png";
const CHAT_RECOVERY_MESSAGE =
  "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
const PRIVACY_INPUT_BLOCK_MESSAGE = "개인정보가 포함된 내용은 입력할 수 없습니다. 개인정보를 제외하고 다시 입력해 주세요.";
const DEFAULT_TRUST_NOTICE = "AI 이음봇도 가끔 실수할 수 있습니다. 중요한 정보는 꼭 다시 한번 확인하세요.";

const PRIVACY_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b\d{6}-[1-4]\d{6}\b/,
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  /\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/,
  /\b(?:19|20)\d{2}[-./](?:0[1-9]|1[0-2])[-./](?:0[1-9]|[12]\d|3[01])\b/,
];

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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasPrivacyInput(value: string): boolean {
  return PRIVACY_PATTERNS.some((pattern) => pattern.test(value));
}

function isUrlLikeCitationPart(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^[\w.-]+\.[a-z]{2,}(?:\/|\?|$)/i.test(value);
}

function sourceUrlDomain(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getFriendlyOutcomeLabel(outcome?: string): string | null {
  if (!outcome || outcome === "answered") return null;
  if (outcome === "insufficient_evidence") return "등록된 자료에서 관련 정보를 충분히 찾지 못했습니다.";
  if (outcome === "restricted") return "안전한 안내 범위에서 답변이 제한된 질문입니다.";
  if (outcome === "conflict") return "근거 확인이 더 필요한 질문입니다.";
  if (outcome === "escalate") return "정확한 확인이 필요한 내용입니다.";
  return null;
}

function toCitationText(citation: ChatCitation, institutionName?: string | null): string {
  const institution = institutionName?.trim() || null;
  const name = citation.documentName?.trim() || "출처";
  const page = citation.pageNumber ? `p.${citation.pageNumber}` : null;
  const section = citation.sectionTitle?.trim() || null;
  const parts = institution && institution !== name ? [institution, name] : [name];

  if (page) parts.push(page);
  if (section && section !== name && !isUrlLikeCitationPart(section)) parts.push(section);

  return parts.join(" | ");
}

function getCitationDisplayName(citation: ChatCitation): string {
  const section = citation.sectionTitle?.trim();
  if (section && !isUrlLikeCitationPart(section)) return section;
  const documentName = citation.documentName?.trim();
  if (documentName) return documentName;
  const sourceTitle = citation.sourceTitle?.trim();
  if (sourceTitle) return sourceTitle;
  return sourceUrlDomain(citation.sourceUrl) ?? "참조 자료";
}

function getCitationTitle(citations: ChatCitation[]): string {
  return citations.some((citation) => citation.sourceUrl?.trim()) ? "참조 링크" : "참조 자료";
}

function shouldFoldCitations(config: WidgetPublicConfig | null): boolean {
  return config?.citationPresentation === "folded" || config?.citationMode === "compact";
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
  if (preferred && preferred !== "기관") {
    return `안녕하세요. ${preferred} AI 상담봇입니다. 궁금하신 내용을 편하게 입력해주세요.`;
  }
  return "안녕하세요. 궁금하신 내용을 입력해주시면 빠르게 안내해드리겠습니다.";
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

function getInitialLauncherIcon(options: WidgetInitOptions): LauncherIconName {
  const icon = options.initialLauncherIcon?.trim();
  const iconUrl = options.initialLauncherIconUrl?.trim();
  if (icon === "custom" && iconUrl) return "custom";
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
  return `${institution} AI 상담봇입니다. 무엇을 도와드릴까요?`;
}

function extractPrimaryColor(gradient: string): string {
  // gradient 문자열에서 첫 번째 hex 색상 추출
  // e.g. "linear-gradient(135deg, #2563EB, #22C55E)" → "#2563EB"
  const match = gradient.match(/#[0-9a-fA-F]{6,8}|#[0-9a-fA-F]{3}/);
  return match ? match[0] : "#2563eb";
}

function hexToRgba(hex: string, alpha: number): string {
  // hex → "rgba(r,g,b,alpha)" 변환
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildScopedStyles(primaryGradient: string): string {
  // primaryGradient: 관리자 위젯 설정의 colorPreset 또는 themeColor 기반 동적 색상
  // 패널 테두리·그림자·강조 색상도 동적으로 적용해 설정 색과 일치시킴
  const pc = extractPrimaryColor(primaryGradient);   // 주 색상 (hex)
  const pcA18 = hexToRgba(pc, 0.18);  // 패널 그림자 (연하게)
  const pcA35 = hexToRgba(pc, 0.35);  // 런처 그림자 (중간)
  const pcA40 = hexToRgba(pc, 0.40);  // 런처 hover 그림자
  const pcA28 = hexToRgba(pc, 0.28);  // 사용자 버블 그림자
  const pcA12 = hexToRgba(pc, 0.12);  // 툴팁 그림자
  const pcA08 = hexToRgba(pc, 0.08);  // 입력창 포커스 ring
  return `
:host { all: initial; }
.ieum-root, .ieum-root * {
  box-sizing: border-box;
  font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", -apple-system, Arial, sans-serif;
  letter-spacing: -0.01em;
}
.ieum-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147480000;
  color: #111827;
}
/* ── 런처 래퍼 ── */
.ieum-launcher-wrap {
  position:absolute; right:0; bottom:0;
  display:flex; flex-direction:column; align-items:flex-end; gap:12px;
}
/* ── 툴팁 말풍선 ── */
.ieum-launcher-tip {
  width:min(300px, calc(100vw - 48px));
  border:1px solid #e8edf5; border-radius:16px;
  background:#fff; box-shadow:0 8px 32px ${pcA12};
  padding:12px 14px 12px 16px; display:none; align-items:flex-start; gap:10px;
}
.ieum-launcher-tip.visible { display:flex; animation:ieum-tooltip-in .18s ease; }
.ieum-launcher-tip-text { flex:1; font-size:13px; line-height:1.6; color:#111827; white-space:pre-wrap; word-break:keep-all; }
.ieum-launcher-tip-close {
  width:22px; height:22px; border:none; border-radius:9999px;
  background:#f3f4f6; color:#6b7280;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer; flex:0 0 auto;
}
.ieum-launcher-tip-close svg { width:13px; height:13px; }
/* ── 플로팅 버튼 ── */
.ieum-floating {
  width:60px; height:60px; border:none; border-radius:9999px;
  background:${primaryGradient}; color:#fff;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  box-shadow:0 6px 24px ${pcA35};
  transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.ieum-floating.ieum-floating-loading { opacity:0; pointer-events:none; transform:scale(.9); }
.ieum-floating:hover { transform:scale(1.06); box-shadow:0 10px 32px ${pcA40}; }
.ieum-floating.ieum-floating-image { background:transparent; box-shadow:none; padding:0; }
.ieum-floating.ieum-floating-image:hover { box-shadow:none; }
.ieum-floating .ieum-launcher-image {
  width:60px; height:60px; border-radius:9999px;
  object-fit:contain; display:block; background:transparent;
}
.ieum-floating.ieum-floating-image .ieum-launcher-image {
  filter:drop-shadow(0 6px 20px ${pcA28});
}
.ieum-floating svg { width:28px; height:28px; }
.ieum-header-icon svg, .ieum-header-icon img, .ieum-header-button svg { width:20px; height:20px; }
.ieum-send svg { width:20px; height:20px; }
.ieum-header-icon img { object-fit:contain; border-radius:9999px; }
/* ── 패널 ── */
.ieum-panel {
  position:absolute; right:0; bottom:0;
  width:min(380px, calc(100vw - 16px));
  height:min(600px, calc(100vh - 16px));
  border-radius:20px;
  border:2px solid ${pc};
  background:#fff;
  overflow:hidden;
  box-shadow:0 16px 48px ${pcA18}, 0 4px 16px rgba(0,0,0,.06);
  display:flex; flex-direction:column;
  opacity:0; transform:translateY(24px) scale(.97);
  pointer-events:none;
  transition:opacity .24s ease, transform .24s ease;
}
.ieum-panel.open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
/* ── 헤더 ── */
.ieum-header {
  min-height:58px; padding:12px 14px;
  background:${primaryGradient};
  color:#fff;
  display:flex; align-items:center; justify-content:space-between;
  flex-shrink:0;
}
.ieum-header-main { display:flex; align-items:center; gap:10px; min-width:0; }
.ieum-header-icon {
  width:36px; height:36px; border-radius:9999px;
  background:rgba(255,255,255,.2);
  display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto;
}
.ieum-title { font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ieum-header-actions { display:flex; align-items:center; gap:4px; }
.ieum-header-button {
  width:32px; height:32px; border:none; border-radius:9999px;
  background:rgba(255,255,255,.15); color:#fff;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  transition:background .15s;
}
.ieum-header-button:hover { background:rgba(255,255,255,.28); }
/* ── 메시지 영역 ── */
.ieum-messages {
  flex:1; padding:16px 14px; background:#fff;
  overflow-y:auto; display:flex; flex-direction:column; gap:12px;
  scroll-behavior:smooth;
}
.ieum-messages::-webkit-scrollbar { width:4px; }
.ieum-messages::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:4px; }
/* ── 배너 ── */
.ieum-banner {
  margin:0 0 4px; border:1px solid #dbeafe; border-radius:12px; padding:10px 12px;
  background:linear-gradient(135deg, #eff6ff, #fff);
}
.ieum-banner-title { font-size:11px; font-weight:700; color:#1e40af; }
.ieum-banner-description { margin-top:3px; font-size:11px; line-height:1.5; color:#475569; white-space:pre-wrap; }
/* ── 스타터 질문 ── */
.ieum-starter-questions {
  display:flex; flex-direction:column; gap:8px; padding:0 0 12px; background:#fff;
}
.ieum-quick-actions { display:flex; flex-wrap:wrap; gap:6px; padding:0 0 8px; background:#fff; }
.ieum-starter-question {
  width:100%; border:1px solid #e5e7eb; border-radius:12px;
  background:#fff; color:#111827; padding:11px 14px;
  cursor:pointer; font-size:13px; line-height:1.45;
  text-align:left; transition:border-color .15s, background .15s;
  display:block;
}
.ieum-starter-question:hover { border-color:#93c5fd; background:#f0f7ff; }
.ieum-quick-action {
  border:1px solid #dbeafe; border-radius:9999px;
  background:#eff6ff; color:#1d4ed8; padding:7px 14px;
  font-size:12px; font-weight:600; cursor:pointer;
  transition:background .15s;
}
.ieum-quick-action:hover { background:#dbeafe; }
/* ── 힌트 버튼 ── */
.ieum-hints-row { display:flex; flex-wrap:wrap; gap:6px; padding:4px 0 8px; }
.ieum-hint-btn {
  background:#eff6ff; border:1px solid #bfdbfe; border-radius:20px;
  padding:6px 14px; font-size:12px; cursor:pointer; color:#1d4ed8;
  transition:background .15s; white-space:nowrap;
}
.ieum-hint-btn:hover { background:#dbeafe; }
/* ── 메시지 버블 ── */
.ieum-message { display:flex; width:100%; animation:ieum-message-in .2s ease; }
.ieum-message.user { justify-content:flex-end; }
.ieum-message.assistant, .ieum-message.system { justify-content:flex-start; }
.ieum-bubble {
  max-width:82%; border-radius:18px; padding:11px 14px;
  font-size:13.5px; line-height:1.65; white-space:pre-wrap; word-break:break-word;
}
.ieum-message.assistant .ieum-bubble, .ieum-message.system .ieum-bubble {
  background:#f8fafc; color:#111827;
  border:1px solid #f1f5f9;
  border-radius:4px 18px 18px 18px;
}
.ieum-message.user .ieum-bubble {
  background:#2563eb; color:#fff;
  border-radius:18px 18px 4px 18px;
  box-shadow:0 2px 8px ${pcA28};
}
/* ── outcome 노트 ── */
.ieum-outcome-note { margin-top:6px; font-size:11.5px; color:#6b7280; }
/* ── citations ── */
.ieum-citations { margin-top:8px; padding-top:8px; border-top:1px solid #f1f5f9; }
.ieum-citations-title { font-size:11px; font-weight:700; color:#6b7280; margin-bottom:5px; }
.ieum-citation { font-size:11px; color:#6b7280; line-height:1.45; margin-bottom:3px; }
.ieum-citation-link { color:#2563eb; text-decoration:none; font-weight:600; overflow-wrap:anywhere; }
.ieum-citation-link:hover { text-decoration:underline; }
.ieum-citations-folded summary { cursor:pointer; font-size:11px; font-weight:700; color:#6b7280; list-style:none; }
.ieum-citations-folded summary::-webkit-details-marker { display:none; }
.ieum-citations-folded summary::after { content:" 펼치기"; font-weight:400; color:#94a3b8; }
.ieum-citations-folded[open] summary { margin-bottom:4px; }
.ieum-citations-folded[open] summary::after { content:" 접기"; }
/* ── 이어볼 질문 (Planee 스타일: 카드 + 아이콘 + 화살표) ── */
.ieum-follow-ups { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
.ieum-follow-ups-title { font-size:11px; font-weight:700; color:#6b7280; margin-bottom:4px; }
.ieum-follow-up-btn {
  appearance:none; display:flex; align-items:center; gap:8px;
  border:1px solid #e5e7eb; border-radius:10px;
  background:#fff; color:#111827;
  padding:9px 12px; font-size:12.5px; line-height:1.4;
  text-align:left; cursor:pointer; width:100%;
  transition:border-color .15s, background .15s;
}
.ieum-follow-up-btn:hover { border-color:#93c5fd; background:#f0f7ff; color:#1d4ed8; }
.ieum-follow-up-icon { font-size:13px; flex-shrink:0; opacity:.6; }
.ieum-follow-up-text { flex:1; }
.ieum-follow-up-arrow { font-size:12px; color:#9ca3af; flex-shrink:0; }
/* ── CTA 버튼 ── */
.ieum-cta-wrap { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
.ieum-cta-title { font-size:11px; font-weight:700; color:#6b7280; margin-bottom:4px; }
.ieum-cta-btn {
  display:inline-flex; align-items:center; gap:7px;
  padding:8px 13px; border-radius:10px;
  border:1px solid #dbeafe; background:#eff6ff;
  color:#1d4ed8; font-size:12.5px; font-weight:500;
  text-decoration:none; cursor:pointer;
  transition:background .15s;
}
.ieum-cta-btn:hover { background:#dbeafe; }
/* ── Tools API 구조화 응답 ── */
.ieum-view-card { margin-top:6px; }
.ieum-view-title { font-size:14px; font-weight:700; color:#111827; margin-bottom:8px; }
.ieum-view-content { font-size:12.5px; color:#374151; line-height:1.65; margin-bottom:4px; }
.ieum-more-link {
  display:inline-flex; align-items:center; gap:4px;
  margin-top:10px; font-size:12px; font-weight:600;
  color:#2563eb; text-decoration:none;
}
.ieum-more-link:hover { text-decoration:underline; }
.ieum-list { list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:8px; }
.ieum-list-item { border:1px solid #e5e7eb; border-radius:12px; padding:11px 13px; background:#fff; }
.ieum-list-item-title { font-size:13px; font-weight:600; color:#111827; margin-bottom:5px; }
.ieum-list-item-content { font-size:12px; color:#6b7280; line-height:1.55; }
.ieum-list-item-link { display:inline-block; margin-top:6px; font-size:11.5px; color:#2563eb; text-decoration:none; }
.ieum-list-item-link:hover { text-decoration:underline; }
/* ── 피드백 ── */
.ieum-feedback-row { display:flex; gap:4px; margin-top:8px; opacity:.55; transition:opacity .2s; }
.ieum-feedback-row:hover { opacity:1; }
.ieum-feedback-btn {
  background:none; border:none; cursor:pointer;
  font-size:14px; padding:3px 5px; border-radius:6px; line-height:1;
  transition:background .15s;
}
.ieum-feedback-btn:hover { background:rgba(0,0,0,.06); }
.ieum-feedback-active { opacity:1 !important; }
.ieum-feedback-thanks { font-size:11px; color:#9ca3af; padding:3px 4px; }
/* ── 타이핑 인디케이터 ── */
.ieum-loading {
  display:none; align-self:flex-start;
  border-radius:4px 18px 18px 18px; padding:12px 16px;
  background:#f8fafc; border:1px solid #f1f5f9;
}
.ieum-loading.active { display:inline-flex; gap:5px; align-items:center; }
.ieum-loading-dot {
  width:6px; height:6px; border-radius:9999px;
  background:#2563eb; opacity:.4;
  animation:ieum-dot 1.2s infinite ease-in-out;
}
.ieum-loading-dot:nth-child(2) { animation-delay:.2s; }
.ieum-loading-dot:nth-child(3) { animation-delay:.4s; }
/* ── 입력 영역 ── */
.ieum-input-wrap {
  padding:10px 12px 10px;
  display:flex; align-items:center; gap:8px;
  background:#fff;
  border-top:1px solid #f3f4f6;
  flex-shrink:0;
}
.ieum-input {
  flex:1; min-width:0; height:46px;
  border-radius:24px; border:1.5px solid #e5e7eb;
  padding:10px 16px; font-size:13.5px; color:#111827; outline:none;
  background:#f9fafb;
  transition:border-color .15s, background .15s;
}
.ieum-input::placeholder { color:#9ca3af; }
.ieum-input:focus { border-color:${pc}; background:#fff; box-shadow:0 0 0 3px ${pcA08}; }
.ieum-send {
  width:44px; height:44px; flex-shrink:0;
  border:none; border-radius:9999px;
  background:#2563eb; color:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  cursor:pointer; transition:background .15s, transform .12s;
}
.ieum-send:hover { background:#1d4ed8; transform:scale(1.06); }
.ieum-send:disabled { opacity:.5; cursor:default; transform:none; }
.ieum-floating:disabled { opacity:.5; cursor:default; }
/* ── 면책 푸터 ── */
.ieum-footer {
  padding:7px 14px 9px;
  background:#fff; font-size:11px; color:#9ca3af; line-height:1.5;
  border-top:1px solid #f3f4f6; text-align:center; flex-shrink:0;
}
.ieum-footer a { color:#6b7280; }
/* ── 애니메이션 ── */
@keyframes ieum-dot {
  0%,80%,100% { transform:translateY(0); opacity:.35; }
  40% { transform:translateY(-4px); opacity:1; }
}
@keyframes ieum-message-in {
  from { opacity:0; transform:translateY(10px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes ieum-tooltip-in {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}
@media (max-width: 640px) {
  .ieum-root { right:8px; left:8px; bottom:8px; }
  .ieum-panel { width:100%; height:min(92vh, calc(100vh - 16px)); border-radius:20px; }
  .ieum-bubble { max-width:88%; }
  .ieum-launcher-tip { width:calc(100vw - 32px); }
}
.ieum-feedback-btn:hover { background:rgba(0,0,0,0.06); }
.ieum-feedback-active { opacity:1 !important; }
.ieum-feedback-thanks { font-size:11px; color:#888; }
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
    this.floatingButton.title = (options.initialLauncherLabel?.trim() || options.launcherLabel) ?? "챗봇 열기";
    this.floatingButton.setAttribute(
      "aria-label",
      (options.initialLauncherLabel?.trim() || options.launcherLabel) ?? "챗봇 열기",
    );
    // Hide button until loadConfig() resolves so the configured icon is shown from the start.
    // The finally block in loadConfig() removes this class once the correct icon is applied.
    this.floatingButton.classList.add("ieum-floating-loading");
    this.floatingButton.replaceChildren();
    const initialLauncherIcon = getInitialLauncherIcon(options);
    const initialLauncherIconUrl = options.initialLauncherIconUrl?.trim();
    this.floatingButton.innerHTML = createIconSvg(initialLauncherIcon, initialLauncherIconUrl);
    this.floatingButton.classList.toggle(
      "ieum-floating-image",
      isImageLauncherIcon(initialLauncherIcon, initialLauncherIconUrl),
    );

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
    this.footerNotice.textContent = DEFAULT_TRUST_NOTICE;
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

    this.ensureInitialMessage();
    void this.loadConfig();
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
      this.footerNotice.textContent = this.config.privacyNotice?.trim() || DEFAULT_TRUST_NOTICE;
      this.renderQuickActions(this.config.quickActions);
      if (this.config.runtime?.chatEndpoint) this.chatEndpoint = this.config.runtime.chatEndpoint;
      if (this.config.runtime?.chatStreamEndpoint) this.chatStreamEndpoint = this.config.runtime.chatStreamEndpoint;
      this.sseEnabled =
        asBoolean(this.config.runtime?.sseEnabled) === true || this.config.runtime?.streamingMode === "sse_preferred";
      if (this.messages.length === 1 && this.messages[0]?.id.startsWith("assistant_welcome_")) {
        this.messages = [];
      }
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

  private createQuickReplyHintsRow(): HTMLDivElement | null {
    const hasUserMessage = this.messages.some((message) => message.role === "user");
    if (hasUserMessage) return null;
    const hints = (this.config?.quickReplyHints ?? []).filter((hint) => hint.trim()).slice(0, 5);
    if (hints.length === 0) return null;

    const hintsRow = createElement(document, "div", "ieum-hints-row");
    hintsRow.dataset["role"] = "hints";
    for (const hint of hints) {
      const button = createElement(document, "button", "ieum-hint-btn");
      button.type = "button";
      button.textContent = hint;
      button.addEventListener("click", () => {
        this.input.value = hint;
        void this.sendCurrentInput();
        hintsRow.style.display = "none";
      });
      hintsRow.appendChild(button);
    }
    return hintsRow;
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

      // ── 구조화 응답 렌더링 (Sprint 3-F) ──────────────────────────────────
      const sr = message.structuredResponse;
      if (sr && message.role === "assistant") {
        if (sr.type === "text") {
          bubble.textContent = (sr as TextResponse).content;
          if ((sr as TextResponse).moreLink) {
            const a = createElement(document, "a", "ieum-more-link") as HTMLAnchorElement;
            a.href = (sr as TextResponse).moreLink!.url;
            a.target = "_blank"; a.rel = "noopener noreferrer";
            a.textContent = `→ ${(sr as TextResponse).moreLink!.title}`;
            bubble.appendChild(a);
          }
        } else if (sr.type === "view") {
          const vr = sr as ViewResponse;
          bubble.textContent = "";
          const wrap = createElement(document, "div", "ieum-view-card");
          const h = createElement(document, "div", "ieum-view-title");
          h.textContent = vr.title;
          wrap.appendChild(h);
          for (const line of vr.content) {
            const p = createElement(document, "p", "ieum-view-content");
            p.textContent = line;
            wrap.appendChild(p);
          }
          if (vr.moreLink) {
            const a = createElement(document, "a", "ieum-more-link") as HTMLAnchorElement;
            a.href = vr.moreLink.url; a.target = "_blank"; a.rel = "noopener noreferrer";
            a.textContent = `→ ${vr.moreLink.title}`;
            wrap.appendChild(a);
          }
          bubble.appendChild(wrap);
        } else if (sr.type === "list") {
          const lr = sr as ListResponse;
          bubble.textContent = "";
          const ul = createElement(document, "ul", "ieum-list");
          for (const item of lr.items.slice(0, 8)) {
            const li = createElement(document, "li", "ieum-list-item");
            const title = createElement(document, "div", "ieum-list-item-title");
            title.textContent = item.title;
            li.appendChild(title);
            for (const c of item.contents.slice(0, 3)) {
              const p = createElement(document, "p", "ieum-list-item-content");
              p.textContent = c;
              li.appendChild(p);
            }
            if (item.targetLink) {
              const a = createElement(document, "a", "ieum-list-item-link") as HTMLAnchorElement;
              a.href = item.targetLink; a.target = "_blank"; a.rel = "noopener noreferrer";
              a.textContent = item.targetLinkLabel || "자세히 보기";
              li.appendChild(a);
            } else if (item.sourceLinkPath) {
              const a = createElement(document, "a", "ieum-list-item-link") as HTMLAnchorElement;
              a.href = item.sourceLinkPath; a.target = "_blank"; a.rel = "noopener noreferrer";
              a.textContent = item.sourceLinkLabel || "출처 보기";
              li.appendChild(a);
            }
            ul.appendChild(li);
          }
          bubble.appendChild(ul);
          if (lr.moreLink) {
            const a = createElement(document, "a", "ieum-more-link") as HTMLAnchorElement;
            a.href = lr.moreLink.url; a.target = "_blank"; a.rel = "noopener noreferrer";
            a.textContent = `→ ${lr.moreLink.title}`;
            bubble.appendChild(a);
          }
        } else {
          bubble.textContent = message.text;
        }
      } else {
        bubble.textContent = message.text;
      }

      if (message.role === "assistant") {
        const outcomeText = getFriendlyOutcomeLabel(message.outcome);
        if (outcomeText) {
          const note = createElement(document, "div", "ieum-outcome-note");
          note.textContent = outcomeText;
          bubble.appendChild(note);
        }
        // 피드백 버튼 (assistant 메시지에만, id가 있을 때만)
        if (message.id) {
          const feedbackRow = createElement(document, "div", "ieum-feedback-row");
          feedbackRow.dataset["messageId"] = message.id;

          const thumbUp = createElement(document, "button", "ieum-feedback-btn") as HTMLButtonElement;
          thumbUp.setAttribute("aria-label", "도움이 됐어요");
          thumbUp.textContent = "👍";

          const thumbDown = createElement(document, "button", "ieum-feedback-btn") as HTMLButtonElement;
          thumbDown.setAttribute("aria-label", "도움이 안 됐어요");
          thumbDown.textContent = "👎";

          const handleFeedback = async (value: 1 | -1) => {
            const messageId = feedbackRow.dataset["messageId"];
            if (!messageId) return;
            try {
              await this.api.sendFeedback(messageId, value);
              thumbUp.classList.toggle("ieum-feedback-active", value === 1);
              thumbDown.classList.toggle("ieum-feedback-active", value === -1);
              setTimeout(() => {
                feedbackRow.innerHTML = '<span class="ieum-feedback-thanks">피드백 감사합니다</span>';
              }, 800);
            } catch {
              // 실패 시 조용히 무시 (UX 방해 안 함)
            }
          };

          thumbUp.addEventListener("click", () => { void handleFeedback(1); });
          thumbDown.addEventListener("click", () => { void handleFeedback(-1); });

          feedbackRow.appendChild(thumbUp);
          feedbackRow.appendChild(thumbDown);
          bubble.appendChild(feedbackRow);
        }

        if (message.citations && message.citations.length > 0) {
          const folded = shouldFoldCitations(this.config);
          const citationTitle = getCitationTitle(message.citations);
          const citationWrap = createElement(
            document,
            folded ? "details" : "div",
            folded ? "ieum-citations ieum-citations-folded" : "ieum-citations",
          );
          const title = createElement(document, folded ? "summary" : "div", "ieum-citations-title");
          title.textContent = folded ? `${citationTitle} ${Math.min(message.citations.length, 5)}건` : citationTitle;
          citationWrap.appendChild(title);
          for (const citation of message.citations.slice(0, 5)) {
            const line = createElement(document, "div", "ieum-citation");
            const sourceUrl = citation.sourceUrl?.trim();
            if (sourceUrl) {
              const link = createElement(document, "a", "ieum-citation-link") as HTMLAnchorElement;
              link.href = sourceUrl;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = getCitationDisplayName(citation);
              line.appendChild(link);
            } else {
              line.textContent = toCitationText(citation, this.config?.institutionName);
            }
            citationWrap.appendChild(line);
          }
          bubble.appendChild(citationWrap);
        }

        if (message.followUpQuestions && message.followUpQuestions.length > 0) {
          const followUpWrap = createElement(document, "div", "ieum-follow-ups");
          const title = createElement(document, "div", "ieum-follow-ups-title");
          title.textContent = "✦ 이런 질문들은 어떠신가요?";
          followUpWrap.appendChild(title);
          for (const followUpQuestion of message.followUpQuestions.slice(0, 3)) {
            const button = createElement(document, "button", "ieum-follow-up-btn") as HTMLButtonElement;
            button.type = "button";
            // 플래니 스타일: 아이콘 + 텍스트 + 화살표
            const icon = createElement(document, "span", "ieum-follow-up-icon");
            icon.textContent = "💬";
            const text = createElement(document, "span", "ieum-follow-up-text");
            text.textContent = followUpQuestion;
            const arrow = createElement(document, "span", "ieum-follow-up-arrow");
            arrow.textContent = "→";
            button.appendChild(icon);
            button.appendChild(text);
            button.appendChild(arrow);
            button.addEventListener("click", () => {
              this.input.value = followUpQuestion;
              void this.sendCurrentInput();
            });
            followUpWrap.appendChild(button);
          }
          bubble.appendChild(followUpWrap);
        }

        // ── CTA 액션 버튼 (conditional_actions) ──────────────────────────
        if (message.conditionalActions && message.conditionalActions.length > 0) {
          const ctaWrap = createElement(document, "div", "ieum-cta-wrap");
          const ctaTitle = createElement(document, "div", "ieum-cta-title");
          ctaTitle.textContent = "관련 정보";
          ctaWrap.appendChild(ctaTitle);
          for (const action of message.conditionalActions) {
            const icon =
              action.type === "link"    ? "🔗" :
              action.type === "video"   ? "🎬" :
              action.type === "file"    ? "📎" : "📞";
            const href =
              action.type === "contact" && !action.value.startsWith("tel:") && !action.value.startsWith("mailto:")
                ? `tel:${action.value}`
                : action.value;
            const link = createElement(document, "a", "ieum-cta-btn") as HTMLAnchorElement;
            link.href = href;
            link.target = action.type === "contact" ? "_self" : "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = `${icon} ${action.label}`;
            if (action.description) link.title = action.description;
            ctaWrap.appendChild(link);
          }
          bubble.appendChild(ctaWrap);
        }
      }

      row.appendChild(bubble);
      this.messagesWrap.appendChild(row);
      if (message.id.startsWith("assistant_welcome_")) {
        const hintsRow = this.createQuickReplyHintsRow();
        if (hintsRow) this.messagesWrap.appendChild(hintsRow);
      }
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
    if (hasPrivacyInput(question)) {
      this.clearInitialWelcomeForDirectQuestion();
      this.lastFailedQuestion = null;
      this.input.value = "";
      this.pushMessage({
        id: `assistant_privacy_${Date.now()}`,
        role: "assistant",
        text: PRIVACY_INPUT_BLOCK_MESSAGE,
        outcome: "restricted",
        timestamp: Date.now(),
      });
      this.input.focus();
      return;
    }
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
        text: CHAT_RECOVERY_MESSAGE,
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
    let streamErrorMessage = "스트리밍 연결 오류가 발생했습니다. 일반 모드로 전환합니다.";
    let finalOutcome = "answered";
    let finalCitations: ChatCitation[] = [];
    let finalFollowUps: string[] = [];
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
      if (event.event === "follow_up_questions") {
        finalFollowUps = asStringArray(data.items).slice(0, 3);
        this.updateMessage(draftMessageId, { followUpQuestions: finalFollowUps });
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
          followUpQuestions: finalFollowUps,
        });
      }
      return true;
    } catch {
      if (receivedVisiblePayload) {
        this.updateMessage(draftMessageId, {
          text: finalText || "응답 수신 중 연결이 종료되었습니다. 잠시 후 다시 시도해 주세요.",
          outcome: finalOutcome,
          citations: finalCitations,
          followUpQuestions: finalFollowUps,
        });
        this.lastFailedQuestion = question;
        return true;
      }
      this.updateMessage(draftMessageId, {
        text: CHAT_RECOVERY_MESSAGE,
        outcome: "insufficient_evidence",
      });
      this.lastFailedQuestion = question;
      return true;
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
      followUpQuestions: Array.isArray(response.followUpQuestions) ? response.followUpQuestions.slice(0, 3) : [],
      conditionalActions: Array.isArray(response.conditionalActions) ? response.conditionalActions : [],
      structuredResponse: response.structuredResponse ?? null,
      timestamp: Date.now(),
    });
  }
}
