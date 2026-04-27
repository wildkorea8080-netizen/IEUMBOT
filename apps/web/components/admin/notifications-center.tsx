"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../../lib/api";
import { getAdminNotifications } from "../../lib/api/notifications";
import type { NotificationItem, NotificationSeverity, NotificationType } from "../../lib/api/notifications-types";
import { PagePanel } from "../ui/page-panel";
import { StatusBadge } from "../ui/status-badge";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "알림 요청에 실패했습니다.";
}

function severityTone(severity: NotificationSeverity): "info" | "warning" | "danger" {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

export function NotificationsCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [severityFilter, setSeverityFilter] = useState<NotificationSeverity | "all">("all");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await getAdminNotifications();
        if (!mounted) return;
        setNotifications(response.items);
      } catch (loadError) {
        if (!mounted) return;
        setError(getErrorMessage(loadError));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return notifications.filter((item) => {
      const matchesSeverity = severityFilter === "all" || item.severity === severityFilter;
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      return matchesSeverity && matchesType;
    });
  }, [notifications, severityFilter, typeFilter]);

  return (
    <PagePanel title="알림" description="기관 관리자는 여기서 조직 범위의 운영 알림을 확인할 수 있습니다.">
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as NotificationSeverity | "all")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">전체 심각도</option>
          <option value="info">정보</option>
          <option value="warning">경고</option>
          <option value="critical">치명</option>
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as NotificationType | "all")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">전체 유형</option>
          <option value="usage_warning">usage_warning</option>
          <option value="usage_exceeded">usage_exceeded</option>
          <option value="error">error</option>
          <option value="system">system</option>
          <option value="security">security</option>
        </select>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-3">시간</th>
              <th className="px-3 py-3">심각도</th>
              <th className="px-3 py-3">유형</th>
              <th className="px-3 py-3">제목</th>
              <th className="px-3 py-3">메시지</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                  알림이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-4">{new Date(item.createdAt).toLocaleString("ko-KR")}</td>
                  <td className="px-3 py-4">
                    <StatusBadge tone={severityTone(item.severity)}>{item.severity}</StatusBadge>
                  </td>
                  <td className="px-3 py-4">{item.type}</td>
                  <td className="px-3 py-4 font-medium text-slate-900">{item.title}</td>
                  <td className="px-3 py-4 text-slate-700">{item.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PagePanel>
  );
}
