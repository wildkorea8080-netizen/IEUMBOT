/**
 * 가벼운 HTML sanitizer — FAQ 에디터(TipTap)가 생성하는 안전한 태그만 허용.
 *
 * packages/widget/src/utils/safeHtml.ts 와 동일한 로직(코드 중복).
 * 외부 의존성 없음. Next.js 서버/클라이언트 양쪽 호환.
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
  const children = Array.from(el.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      const textNode = doc.createTextNode(child.textContent || "");
      child.replaceWith(textNode);
      continue;
    }
    const allowedAttrs = ALLOWED_ATTRS_PER_TAG[tag] || new Set<string>();
    for (const attr of Array.from(child.attributes)) {
      if (!allowedAttrs.has(attr.name.toLowerCase())) {
        child.removeAttribute(attr.name);
      }
    }
    if (tag === "a") {
      const href = child.getAttribute("href") || "";
      if (!isSafeUrl(href)) {
        child.removeAttribute("href");
      }
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer");
    }
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
