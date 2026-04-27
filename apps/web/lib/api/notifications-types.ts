export type NotificationType = "usage_warning" | "usage_exceeded" | "error" | "system" | "security";
export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationSentTo = "slack" | "email" | "webhook" | "inapp";
export type IntegrationType = "slack" | "email" | "webhook";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  organizationId?: string | null;
  chatbotId?: string | null;
  isRead: boolean;
  sentTo: NotificationSentTo;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type NotificationListResponse = {
  items: NotificationItem[];
};

export type NotificationReadRequest = {
  isRead: boolean;
};

export type SystemIntegrationItem = {
  id: string;
  type: IntegrationType;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SystemIntegrationListResponse = {
  items: SystemIntegrationItem[];
};

export type SystemIntegrationUpsertRequest = {
  type: IntegrationType;
  config: Record<string, unknown>;
  isActive: boolean;
};
