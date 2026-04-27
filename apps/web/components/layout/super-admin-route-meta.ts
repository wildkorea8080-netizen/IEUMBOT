import type { RouteMeta } from "./admin-route-meta";

const SUPER_ADMIN_ROUTE_META: Array<{ href: string; meta: RouteMeta }> = [
  { href: "/super-admin/dashboard", meta: { title: "대시보드", breadcrumbs: ["전체 관리자", "대시보드"] } },
  { href: "/super-admin/organizations", meta: { title: "조직 관리", breadcrumbs: ["전체 관리자", "조직 관리"] } },
  { href: "/super-admin/contracts", meta: { title: "계약 관리", breadcrumbs: ["전체 관리자", "계약 관리"] } },
  { href: "/super-admin/billing", meta: { title: "결제 관리", breadcrumbs: ["전체 관리자", "결제 관리"] } },
  { href: "/super-admin/accounts", meta: { title: "계정 관리", breadcrumbs: ["전체 관리자", "계정 관리"] } },
  { href: "/super-admin/api", meta: { title: "공용 API 관리", breadcrumbs: ["전체 관리자", "공용 API"] } },
  { href: "/super-admin/api/usage", meta: { title: "API 사용량", breadcrumbs: ["전체 관리자", "공용 API", "사용량"] } },
  { href: "/super-admin/chatbots", meta: { title: "챗봇 관리", breadcrumbs: ["전체 관리자", "챗봇"] } },
  { href: "/super-admin/widgets", meta: { title: "위젯 관리", breadcrumbs: ["전체 관리자", "위젯"] } },
  { href: "/super-admin/system", meta: { title: "시스템 제어", breadcrumbs: ["전체 관리자", "시스템"] } },
  { href: "/super-admin/notifications", meta: { title: "알림", breadcrumbs: ["전체 관리자", "알림"] } },
  { href: "/super-admin/enforcement", meta: { title: "제재 관리", breadcrumbs: ["전체 관리자", "제재 관리"] } },
  { href: "/super-admin/usage", meta: { title: "사용량 모니터링", breadcrumbs: ["전체 관리자", "사용량"] } },
  { href: "/super-admin/security", meta: { title: "보안 로그", breadcrumbs: ["전체 관리자", "보안"] } },
  { href: "/super-admin/knowledge-status", meta: { title: "지식 현황", breadcrumbs: ["전체 관리자", "지식 관리"] } },
];

export function getSuperAdminRouteMeta(pathname: string): RouteMeta {
  const matched = [...SUPER_ADMIN_ROUTE_META]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return matched?.meta ?? { title: "전체 관리자", breadcrumbs: ["전체 관리자"] };
}
