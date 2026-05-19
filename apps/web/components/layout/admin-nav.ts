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
    title: "지식 관리",
    items: [
      { label: "지식 등록",   href: "/admin/knowledge/register", icon: "Upload" },
      { label: "지식 목록",   href: "/admin/knowledge/list",     icon: "BookOpen" },
      { label: "미답변 질문", href: "/admin/knowledge-gap",      icon: "AlertCircle" },
    ],
  },
  {
    title: "챗봇 설정",
    items: [
      { label: "챗봇 관리",   href: "/admin/chatbots",         icon: "BotMessageSquare" },
      { label: "기본 설정",   href: "/admin/ai/basic",         icon: "Bot" },
      { label: "응답 스타일", href: "/admin/ai/style",         icon: "Palette" },
      { label: "AI 고급설정", href: "/admin/answer-settings",  icon: "Settings2" },
      { label: "조건별 답변",   href: "/admin/conditional",       icon: "Zap" },
      { label: "API 연동",      href: "/admin/api-connect",       icon: "Plug2" },
      { label: "위젯 설정",   href: "/admin/widget",           icon: "MonitorSmartphone" },
      { label: "설치 가이드", href: "/admin/install-guide",    icon: "Code2" },
    ],
  },
  {
    title: "운영 분석",
    items: [
      { label: "대화 목록",   href: "/admin/conversations",  icon: "MessageSquare" },
      { label: "채팅 로그",   href: "/admin/logs",           icon: "ScrollText" },
      { label: "품질 리포트", href: "/admin/quality-report", icon: "BarChart2" },
      { label: "피드백 현황", href: "/admin/feedback",       icon: "ThumbsUp" },
      { label: "미답변 관리", href: "/admin/unanswered",     icon: "HelpCircle" },
    ],
  },
  {
    title: "시스템",
    items: [
      { label: "보안센터",    href: "/admin/security", icon: "Shield" },
      { label: "사용자 관리", href: "/admin/users",    icon: "Users" },
      { label: "결제 관리",   href: "/admin/billing",  icon: "CreditCard" },
    ],
  },
];

// 하위 호환: 기존 adminNavItems가 필요한 파일을 위해 flat 배열도 export
export const adminNavItems = adminNav.flatMap((g) => g.items);
