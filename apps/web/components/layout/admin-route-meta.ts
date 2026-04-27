export type RouteMeta = {
  title: string;
  breadcrumbs: string[];
};

const ADMIN_ROUTE_META: Array<{ href: string; meta: RouteMeta }> = [
  { href: "/admin/dashboard", meta: { title: "대시보드", breadcrumbs: ["기관 관리자", "대시보드"] } },
  { href: "/admin/ai/basic", meta: { title: "기본 AI", breadcrumbs: ["기관 관리자", "AI 설정", "기본 AI"] } },
  { href: "/admin/ai/style", meta: { title: "스타일 규칙", breadcrumbs: ["기관 관리자", "AI 설정", "스타일 규칙"] } },
  { href: "/admin/ai/conditional", meta: { title: "조건부 규칙", breadcrumbs: ["기관 관리자", "AI 설정", "조건부 규칙"] } },
  { href: "/admin/knowledge/register", meta: { title: "지식 등록", breadcrumbs: ["기관 관리자", "지식 관리", "등록"] } },
  { href: "/admin/knowledge/list", meta: { title: "지식 목록", breadcrumbs: ["기관 관리자", "지식 관리", "목록"] } },
  { href: "/admin/conversations", meta: { title: "대화 관리", breadcrumbs: ["기관 관리자", "운영", "대화 관리"] } },
  { href: "/admin/install-guide", meta: { title: "설치 가이드", breadcrumbs: ["기관 관리자", "운영", "설치 가이드"] } },
  { href: "/admin/security", meta: { title: "보안", breadcrumbs: ["기관 관리자", "운영", "보안"] } },
  { href: "/admin/usage", meta: { title: "사용량", breadcrumbs: ["기관 관리자", "운영", "사용량"] } },
  { href: "/admin/billing", meta: { title: "결제 관리", breadcrumbs: ["기관 관리자", "운영", "결제 관리"] } },
  { href: "/admin/notifications", meta: { title: "알림", breadcrumbs: ["기관 관리자", "운영", "알림"] } },
  { href: "/admin/users", meta: { title: "사용자", breadcrumbs: ["기관 관리자", "운영", "사용자"] } },
  { href: "/admin/audit", meta: { title: "감사 로그", breadcrumbs: ["기관 관리자", "운영", "감사 로그"] } },
  { href: "/admin/chatbots", meta: { title: "챗봇", breadcrumbs: ["기관 관리자", "고급", "챗봇"] } },
  { href: "/admin/answer-settings", meta: { title: "응답 설정", breadcrumbs: ["기관 관리자", "고급", "응답 설정"] } },
  { href: "/admin/guardrails", meta: { title: "가드레일", breadcrumbs: ["기관 관리자", "고급", "가드레일"] } },
  { href: "/admin/search-control", meta: { title: "검색 제어", breadcrumbs: ["기관 관리자", "고급", "검색 제어"] } },
  { href: "/admin/escalations", meta: { title: "에스컬레이션", breadcrumbs: ["기관 관리자", "고급", "에스컬레이션"] } },
  { href: "/admin/widget", meta: { title: "위젯", breadcrumbs: ["기관 관리자", "고급", "위젯"] } },
  { href: "/admin/chat-logs", meta: { title: "채팅 로그", breadcrumbs: ["기관 관리자", "고급", "채팅 로그"] } },
  { href: "/admin/conversation-analysis", meta: { title: "대화 분석", breadcrumbs: ["기관 관리자", "고급", "대화 분석"] } },
  { href: "/admin/test-chat", meta: { title: "테스트 채팅", breadcrumbs: ["기관 관리자", "고급", "테스트 채팅"] } },
];

export function getAdminRouteMeta(pathname: string): RouteMeta {
  const matched = [...ADMIN_ROUTE_META]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return matched?.meta ?? { title: "기관 관리자", breadcrumbs: ["기관 관리자"] };
}
