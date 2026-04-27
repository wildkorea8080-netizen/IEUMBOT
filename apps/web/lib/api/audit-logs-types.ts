export type AdminAuditLogItem = {
  logId: string;
  time: string;
  adminEmail?: string | null;
  adminName?: string | null;
  action: string;
  actionLabel: string;
  actionType: string;
  targetType?: string | null;
  targetId?: string | null;
  result: string;
};

export type AdminAuditLogsResponse = {
  items: AdminAuditLogItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type AdminAuditLogDetail = {
  logId: string;
  time: string;
  adminEmail?: string | null;
  adminName?: string | null;
  action: string;
  actionLabel: string;
  actionType: string;
  targetType?: string | null;
  targetId?: string | null;
  result: string;
  metadataSummary: Record<string, string>;
};

