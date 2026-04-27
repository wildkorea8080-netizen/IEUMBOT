export type AdminUsageLimitStatus = {
  key: string;
  label: string;
  used: number;
  limit?: number | null;
  usageRate?: number | null;
  status: string;
  statusLabel: string;
};

export type AdminUsageSummary = {
  totalConversations: number;
  monthlyUsage: number;
  monthlyLimit?: number | null;
  monthlyUsageRate?: number | null;
  activeChatbots: number;
  activeWidgets: number;
  limits: AdminUsageLimitStatus[];
};

export type AdminUsageDailyItem = {
  date: string;
  conversationCount: number;
};

export type AdminUsageDailyResponse = {
  rangeType: string;
  fromDate: string;
  toDate: string;
  items: AdminUsageDailyItem[];
};

export type AdminChatbotUsageItem = {
  chatbotId: string;
  chatbotName: string;
  conversationCount: number;
  averageResponseTimeMs?: number | null;
  successRate?: number | null;
  fallbackRate?: number | null;
};

export type AdminChatbotUsageResponse = {
  items: AdminChatbotUsageItem[];
};

