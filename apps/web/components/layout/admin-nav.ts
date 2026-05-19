export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: string;
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
      { label: "AI 기본 설정", href: "/admin/ai/basic",    icon: "Bot" },
      { label: "대화 스타일",  href: "/admin/ai/style",    icon: "Palette" },
      { label: "조건별 답변",  href: "/admin/conditional", icon: "Zap" },
      { label: "API 연동",     href: "/admin/api-connect", icon: "Plug2" },
    ],
  },
  {
    title: "지식 관리",
    items: [
      { label: "지식 등록", href: "/admin/knowledge/register", icon: "Upload" },
      { label: "지식 목록", href: "/admin/knowledge/list",     icon: "BookOpen" },
    ],
  },
  {
    title: "설치/연동",
    items: [
      { label: "위젯 설치", href: "/admin/widget-install", icon: "MonitorSmartphone" },
    ],
  },
  {
    title: "대화 관리",
    items: [
      { label: "대화 관리",   href: "/admin/conversations", icon: "MessageSquare" },
      { label: "미답변 관리", href: "/admin/unanswered",    icon: "HelpCircle" },
    ],
  },
  {
    title: undefined,
    items: [
      { label: "대화 테스트", href: "/admin/test-chatbot", icon: "TestTube2" },
    ],
  },
  {
    title: "보안/관리",
    items: [
      { label: "보안센터",    href: "/admin/security", icon: "Shield" },
      { label: "사용자 관리", href: "/admin/users",    icon: "Users" },
      { label: "결제 관리",   href: "/admin/billing",  icon: "CreditCard" },
    ],
  },
];

// 하위 호환: 기존 adminNavItems가 필요한 파일을 위해 flat 배열도 export
export const adminNavItems = adminNav.flatMap((g) => g.items);
