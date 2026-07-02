/**
 * 경량 마크다운 → HTML 변환기 (외부 의존성 없음, 위젯 번들 크기 최소).
 *
 * 지원: 표(table), 헤딩(#), 순서/비순서 목록, 인용(>), 굵게/기울임/인라인코드, 링크.
 * 출력은 반드시 sanitizeHtml()을 한 번 더 거쳐 렌더한다(방어적).
 * 마크다운 문법이 없는 일반 텍스트는 looksLikeMarkdown()이 false → 평문 경로 유지.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 인라인 서식 (입력은 이미 escapeHtml 처리된 상태)
function inline(s: string): string {
  let out = s;
  out = out.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u}">${t}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  return out;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const RE_TABLE_ROW = /^\s*\|.*\|\s*$/;
const RE_TABLE_SEP = /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/;
const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_UL = /^\s*[-*]\s+(.*)$/;
const RE_OL = /^\s*\d+\.\s+(.*)$/;
const RE_BQ = /^\s*>\s+(.*)$/;

export function looksLikeMarkdown(text: string): boolean {
  return (
    /(^|\n)\s*\|.*\|/.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /(^|\n)\s*[-*]\s+\S/.test(text) ||
    /(^|\n)\s*\d+\.\s+\S/.test(text) ||
    /(^|\n)#{1,6}\s+\S/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /(^|\n)>\s+\S/.test(text)
  );
}

export function markdownToHtml(md: string): string {
  const lines = escapeHtml(md.replace(/\r\n/g, "\n")).split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 표: 헤더행 + 구분행(---)
    if (RE_TABLE_ROW.test(line) && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) {
      closeList();
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && RE_TABLE_ROW.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      let t = "<table><thead><tr>" + header.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>";
      for (const r of rows) t += "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
      t += "</tbody></table>";
      out.push(t);
      continue;
    }

    const h = line.match(RE_HEADING);
    if (h) {
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i += 1;
      continue;
    }

    const ul = line.match(RE_UL);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      i += 1;
      continue;
    }

    const ol = line.match(RE_OL);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      i += 1;
      continue;
    }

    const bq = line.match(RE_BQ);
    if (bq) {
      closeList();
      out.push(`<blockquote>${inline(bq[1])}</blockquote>`);
      i += 1;
      continue;
    }

    if (line.trim() === "") {
      closeList();
      i += 1;
      continue;
    }

    // 일반 문단: 연속된 비-특수 줄을 <br>로 이음
    closeList();
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !RE_TABLE_ROW.test(lines[i]) &&
      !RE_HEADING.test(lines[i]) &&
      !RE_UL.test(lines[i]) &&
      !RE_OL.test(lines[i]) &&
      !RE_BQ.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  closeList();
  return out.join("");
}
