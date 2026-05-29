/**
 * 가벼운 HTML sanitizer — FAQ 에디터(TipTap)가 생성하는 안전한 태그만 허용.
 *
 * 외부 의존성 없음. 위젯 번들 크기 영향 최소화.
 * 위험 태그(script/style/iframe/object/embed) + 이벤트 핸들러 속성 + javascript: URL 제거.
 *
 * 일반 plain text는 HTML 감지가 실패해 그대로 textContent로 폴백되도록 looksLikeHtml 헬퍼 동봉.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "b", "i", "u", "s", "mark", "code", "pre",
  "ul", "ol", "li",
  "a",
  "table", "thead", "tbody", "tr", "td", "th", "caption",
  "blockquote", "hr",
  "img",
]);

const ALLOWED_ATTRS_PER_TAG: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

const HTML_TAG_RE = /<[a-zA-Z][a-zA-Z0-9]*(\s|>|\/)/;

export function looksLikeHtml(text: string): boolean {
  return HTML_TAG_RE.test(text);
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return false;
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("file:")
  ) {
    return false;
  }
  return true;
}

function sanitizeElement(el: Element, doc: Document): void {
  // 자식 먼저 정리(재귀)
  const children = Array.from(el.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // 허용 안 된 태그: 텍스트만 추출해 대체
      const textNode = doc.createTextNode(child.textContent || "");
      child.replaceWith(textNode);
      continue;
    }
    // 속성 필터링
    const allowedAttrs = ALLOWED_ATTRS_PER_TAG[tag] || new Set<string>();
    for (const attr of Array.from(child.attributes)) {
      if (!allowedAttrs.has(attr.name.toLowerCase())) {
        child.removeAttribute(attr.name);
      }
    }
    // 링크 안전 처리
    if (tag === "a") {
      const href = child.getAttribute("href") || "";
      if (!isSafeUrl(href)) {
        child.removeAttribute("href");
      }
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer");
    }
    // 이미지 안전 처리
    if (tag === "img") {
      const src = child.getAttribute("src") || "";
      if (!isSafeUrl(src)) {
        child.removeAttribute("src");
      }
    }
    sanitizeElement(child, doc);
  }
}

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // SSR/Node 환경: 모든 태그 제거(보수적)
    return html.replace(/<[^>]*>/g, "");
  }
  if (!html) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__ieum_root__">${html}</div>`, "text/html");
  const root = doc.getElementById("__ieum_root__");
  if (!root) return "";
  sanitizeElement(root, doc);
  return root.innerHTML;
}
