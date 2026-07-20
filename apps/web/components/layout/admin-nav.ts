import type { SetupKey } from "../../lib/admin-ui/setup-status";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: string;
  setupKey?: SetupKey;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export const adminNav: NavGroup[] = [
  {
    title: undefined,
    items: [
      { label: "대시보드", href: "/admin/dashboard", icon: "LayoutDashboard" },
    ],
  },
  {
    title: "AI 설정",
    items: [
      { label: "AI 기본설정",    href: "/admin/ai/basic",    icon: "Bot",      setupKey: "ai_basic" },
      { label: "대화 스타일 설정", href: "/admin/ai/style",    icon: "Palette",  setupKey: "ai_style" },
      { label: "위젯 설정",      href: "/admin/widget",      icon: "Settings2" },
      { label: "조건별 답변 설정", href: "/admin/conditional", icon: "Zap" },
    ],
  },
  {
    title: "지식베이스",
    items: [
      { label: "지식등록",  href: "/admin/knowledge/register", icon: "Upload" },
      { label: "지식관리",  href: "/admin/knowledge/list",     icon: "BookOpen" },
      { label: "API 연동",  href: "/admin/api-connect",        icon: "Plug2" },
    ],
  },
  {
    title: "테스트·설치",
    items: [
      { label: "대화 테스트", href: "/admin/test-chat",     icon: "TestTube2" },
      { label: "설치 안내",   href: "/admin/install-guide", icon: "MonitorSmartphone", setupKey: "install" },
    ],
  },
  {
    title: undefined,
    items: [
      { label: "대화관리", href: "/admin/chat-logs", icon: "MessageSquare" },
      { label: "상담 주제 분포", href: "/admin/subject-distribution", icon: "BarChart2" },
    ],
  },
  {
    title: undefined,
    items: [
      { label: "보안센터", href: "/admin/security", icon: "Shield" },
    ],
  },
  {
    title: "기관 설정",
    items: [
      { label: "관리자 관리", href: "/admin/team", icon: "Users" },
    ],
  },
];

// 하위 호환: 기존 adminNavItems가 필요한 파일을 위해 flat 배열도 export
export const adminNavItems = adminNav.flatMap((g) => g.items);
