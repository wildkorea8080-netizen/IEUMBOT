/**
 * 가벼운 HTML sanitizer — FAQ 에디터(TipTap)가 생성하는 안전한 태그만 허용.
 *
 * 외부 의존성 없음. 위젯 번들 크기 영향 최소화.
 * 위험 태그(script/style/iframe/object/embed) + 이벤트 핸들러 속성 + javascript: URL 제거.
 *
 * 일반 plain text는 HTML 감지가 실패해 그대로 textContent로 폴백되도록 looksLikeHtml 헬퍼 동봉.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span", "section", "article", "header", "footer", "small", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "b", "i", "u", "s", "mark", "code", "pre",
  "ul", "ol", "li",
  "a",
  "table", "thead", "tbody", "tr", "td", "th", "caption", "colgroup", "col",
  "blockquote", "hr", "figure", "figcaption",
  "img",
]);

const ALLOWED_ATTRS_PER_TAG: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
};

// 인라인 style에서 허용하는 CSS 속성(레이아웃·타이포·색상 등 안전한 것만).
// FAQ 디자인 HTML의 인라인 스타일이 렌더되도록 허용하되, 위험 속성/값은 차단.
const ALLOWED_STYLE_PROPS = new Set([
  "color", "background", "background-color",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "gap", "row-gap", "column-gap",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-width", "border-style", "border-color", "border-radius",
  "border-collapse", "border-spacing",
  "font", "font-size", "font-weight", "font-style", "font-family", "line-height",
  "letter-spacing", "text-align", "text-decoration", "text-transform", "white-space",
  "word-break", "overflow-wrap", "vertical-align",
  "width", "min-width", "max-width", "height", "min-height", "max-height", "box-sizing",
  "display", "flex", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "align-items", "align-self", "justify-content", "justify-items",
  "grid-template-columns", "grid-template-rows", "grid-gap",
  "list-style", "list-style-type", "list-style-position",
  "box-shadow", "opacity", "overflow", "overflow-x", "overflow-y",
]);

function sanitizeStyleValue(style: string): string {
  const kept: string[] = [];
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    const low = value.toLowerCase();
    // 위험 값 차단(외부 리소스·스크립트·오버레이 등)
    if (
      low.includes("url(") ||
      low.includes("expression") ||
      low.includes("javascript:") ||
      low.includes("@import") ||
      low.includes("</") ||
      low.includes("fixed") ||
      low.includes("absolute") ||
      low.includes("sticky")
    ) {
      continue;
    }
    kept.push(`${prop}: ${value}`);
  }
  return kept.join("; ");
}

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
    // 속성 필터링 (style은 값 검증 후 유지, 나머지는 태그별 허용목록)
    const allowedAttrs = ALLOWED_ATTRS_PER_TAG[tag] || new Set<string>();
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "style") {
        const safe = sanitizeStyleValue(attr.value);
        if (safe) {
          child.setAttribute("style", safe);
        } else {
          child.removeAttribute("style");
        }
        continue;
      }
      if (!allowedAttrs.has(name)) {
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
