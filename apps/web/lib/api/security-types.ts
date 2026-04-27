export type AdminSecuritySummary = {
  blockedToday: number;
  fallbackToday: number;
  escalationToday: number;
  errorToday: number;
};

export type AdminSecurityEventItem = {
  eventId: string;
  sessionId: string;
  chatbotId: string;
  chatbotName: string;
  time: string;
  questionPreview?: string | null;
  eventType: "BLOCKED" | "FALLBACK" | "ESCALATION" | "ERROR" | string;
  eventLabel: string;
  reasonLabel: string;
  responseTimeMs?: number | null;
};

export type AdminSecurityEventsResponse = {
  items: AdminSecurityEventItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type AdminSecurityEventDetail = {
  eventId: string;
  sessionId: string;
  chatbotId: string;
  chatbotName: string;
  userQuestion?: string | null;
  assistantAnswer?: string | null;
  eventType: "BLOCKED" | "FALLBACK" | "ESCALATION" | "ERROR" | string;
  eventLabel: string;
  status: string;
  time: string;
  reasonLabel: string;
  fallbackMessage?: string | null;
  escalated: boolean;
  responseTimeMs?: number | null;
  advancedAnalysisUrl?: string | null;
};
