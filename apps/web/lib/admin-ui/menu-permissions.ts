import { adminNav, type NavGroup } from "../../components/layout/admin-nav";

/**
 * 기관사용자(institution_user) 메뉴 접근 권한 — 백엔드 app/core/menu_permissions.py의
 * MENU_KEYS와 1:1 대응. 각 키를 사이드바 nav href에 매핑한다.
 * '관리자 관리(/admin/team)'는 기관관리자 전용이라 키가 없다(멤버에게 노출 안 됨).
 */
export type MenuKey =
  | "dashboard"
  | "ai_basic"
  | "ai_style"
  | "widget"
  | "conditional"
  | "knowledge_register"
  | "knowledge_list"
  | "api_connect"
  | "test_chat"
  | "install_guide"
  | "chat_logs"
  | "subject_distribution"
  | "security";

/** UI 표시 순서 + 라벨(권한 설정 체크박스에 사용). */
export const MENU_CATALOG: { key: MenuKey; label: string; href: string }[] = [
  { key: "dashboard", label: "대시보드", href: "/admin/dashboard" },
  { key: "ai_basic", label: "AI 기본설정", href: "/admin/ai/basic" },
  { key: "ai_style", label: "대화 스타일 설정", href: "/admin/ai/style" },
  { key: "widget", label: "위젯 설정", href: "/admin/widget" },
  { key: "conditional", label: "조건별 답변 설정", href: "/admin/conditional" },
  { key: "knowledge_register", label: "지식등록", href: "/admin/knowledge/register" },
  { key: "knowledge_list", label: "지식관리", href: "/admin/knowledge/list" },
  { key: "api_connect", label: "API 연동", href: "/admin/api-connect" },
  { key: "test_chat", label: "대화 테스트", href: "/admin/test-chat" },
  { key: "install_guide", label: "설치 안내", href: "/admin/install-guide" },
  { key: "chat_logs", label: "대화관리", href: "/admin/chat-logs" },
  { key: "subject_distribution", label: "상담 주제 분포", href: "/admin/subject-distribution" },
  { key: "security", label: "보안센터", href: "/admin/security" },
];

const HREF_TO_KEY = new Map<string, MenuKey>(MENU_CATALOG.map((m) => [m.href, m.key]));

/** nav href → 권한 키. 매핑 없으면(예: /admin/team) null(=멤버 접근 불가 메뉴). */
export function menuKeyForHref(href: string): MenuKey | null {
  return HREF_TO_KEY.get(href) ?? null;
}

/**
 * 기관사용자가 접근할 수 있는지: 부여된 권한에 해당 메뉴 키가 있어야 한다.
 * 매핑 없는 href(관리자 전용)는 항상 false.
 */
export function memberCanAccessHref(href: string, permissions: string[]): boolean {
  const key = menuKeyForHref(href);
  return key !== null && permissions.includes(key);
}

/** 기관사용자용 사이드바: 허용된 메뉴 항목만 남긴 nav 그룹. */
export function filterNavForMember(permissions: string[]): NavGroup[] {
  return adminNav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => memberCanAccessHref(item.href, permissions)),
    }))
    .filter((group) => group.items.length > 0);
}

/** 로그인 후 기관사용자를 보낼 첫 허용 메뉴. 없으면 null(=권한 없음 화면). */
export function firstPermittedHref(permissions: string[]): string | null {
  for (const menu of MENU_CATALOG) {
    if (permissions.includes(menu.key)) return menu.href;
  }
  return null;
}
