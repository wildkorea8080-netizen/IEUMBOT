/**
 * 위젯 배너 카드용 내장 아이콘 세트 (관리자 콘솔 표시용).
 *
 * ⚠️ packages/widget/src/bootstrap/widget-app.ts 의 STARTER_ICONS 와
 *    name 세트/모양을 동기화해서 유지할 것. (관리자가 여기서 고른 name이
 *    "[name] 질문" 형태로 저장되고, 위젯이 같은 name으로 SVG를 렌더한다.)
 */
import type { ReactElement } from "react";

const SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: 22,
  height: 22,
};

const ICONS: Record<string, ReactElement> = {
  doc: (
    <svg {...SVG_PROPS}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  ),
  shield: (
    <svg {...SVG_PROPS}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  member: (
    <svg {...SVG_PROPS}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 20c0-3.3 2.7-5.6 6-5.6 1.2 0 2.3.3 3.2.8" />
      <path d="M18 14v6M15 17h6" />
    </svg>
  ),
  cert: (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="9" r="5.2" />
      <path d="M9.7 9l1.6 1.6 3-3.2" />
      <path d="M8.5 13.2 7 20l5-2.6L17 20l-1.5-6.8" />
    </svg>
  ),
  search: (
    <svg {...SVG_PROPS}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  ),
  phone: (
    <svg {...SVG_PROPS}>
      <path d="M6.6 10.8a12 12 0 0 0 5.6 5.6l1.9-1.9a1 1 0 0 1 1-.24 11 11 0 0 0 3.4.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1h3.3a1 1 0 0 1 1 1 11 11 0 0 0 .55 3.4 1 1 0 0 1-.24 1z" />
    </svg>
  ),
  apply: (
    <svg {...SVG_PROPS}>
      <path d="M5 4h9l4 4v6" />
      <path d="M14 4v4h4" />
      <path d="M13 21l-4 1 1-4 6.5-6.5a1.4 1.4 0 0 1 2 2z" />
    </svg>
  ),
  check: (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  ),
  info: (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  ),
  won: (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 9l1.6 6L12 10l2.4 5L16 9" />
      <path d="M7.4 11.5h9.2" />
    </svg>
  ),
  grid: (
    <svg {...SVG_PROPS}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  ),
  chat: (
    <svg {...SVG_PROPS}>
      <path d="M4 5h16v11H9l-4 3v-3H4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  ),
  calendar: (
    <svg {...SVG_PROPS}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  ),
  building: (
    <svg {...SVG_PROPS}>
      <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M15 9h3a1 1 0 0 1 1 1v11" />
      <path d="M8 8h4M8 12h4M8 16h4" />
    </svg>
  ),
};

export const STARTER_ICON_NAMES = Object.keys(ICONS);

const ICON_LABELS: Record<string, string> = {
  doc: "문서/안내",
  shield: "보안/개인정보",
  member: "회원/대상",
  cert: "인증/자격",
  search: "검색/조회",
  phone: "전화/상담",
  apply: "신청/접수",
  check: "완료/결과",
  info: "정보/안내",
  won: "비용/요금",
  grid: "서비스/메뉴",
  chat: "문의/상담",
  calendar: "일정/기간",
  building: "기관/센터",
};

export function starterIconLabel(name: string): string {
  return ICON_LABELS[name] ?? name;
}

export function StarterIconPreview({ name }: { name: string }): ReactElement | null {
  return ICONS[name] ?? null;
}
