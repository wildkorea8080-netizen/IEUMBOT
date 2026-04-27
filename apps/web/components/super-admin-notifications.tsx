"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  createSystemIntegration,
  getSuperAdminNotifications,
  getSystemIntegrations,
  markSuperAdminNotificationRead,
  patchSystemIntegration,
} from "../lib/api/notifications";
import type {
  NotificationItem,
  NotificationSeverity,
  NotificationType,
  SystemIntegrationItem,
} from "../lib/api/notifications-types";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type SlackFormState = {
  webhookUrl: string;
  channel: string;
  mention: string;
  isActive: boolean;
};

const EMPTY_SLACK_FORM: SlackFormState = {
  webhookUrl: "",
  channel: "",
  mention: "",
  isActive: true,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "알림 요청에 실패했습니다.";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

function severityTone(severity: NotificationSeverity): "info" | "warning" | "danger" {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

function maskWebhook(url: string): string {
  return url === "masked" ? "Configured" : url;
}

export function SuperAdminNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [integrations, setIntegrations] = useState<SystemIntegrationItem[]>([]);
  const [severityFilter, setSeverityFilter] = useState<NotificationSeverity | "all">("all");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [slackForm, setSlackForm] = useState<SlackFormState>(EMPTY_SLACK_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [notificationResponse, integrationResponse] = await Promise.all([
        getSuperAdminNotifications(),
        getSystemIntegrations(),
      ]);
      setNotifications(notificationResponse.items);
      setIntegrations(integrationResponse.items);
      const slackIntegration = integrationResponse.items.find((item) => item.type === "slack");
      if (slackIntegration) {
        setSlackForm({
          webhookUrl: maskWebhook(String(slackIntegration.config.webhookUrl ?? "")),
          channel: String(slackIntegration.config.channel ?? ""),
          mention: String(slackIntegration.config.mention ?? ""),
          isActive: slackIntegration.isActive,
        });
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const matchesSeverity = severityFilter === "all" || item.severity === severityFilter;
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      return matchesSeverity && matchesType;
    });
  }, [notifications, severityFilter, typeFilter]);

  async function handleMarkRead(item: NotificationItem) {
    try {
      const updated = await markSuperAdminNotificationRead(item.id, { isRead: !item.isRead });
      setNotifications((current) => current.map((row) => (row.id === item.id ? updated : row)));
      setMessage(updated.isRead ? "알림을 읽음으로 표시했습니다." : "알림을 읽지 않음으로 표시했습니다.");
    } catch (markError) {
      setError(getErrorMessage(markError));
    }
  }

  async function saveSlackIntegration() {
    setIsSaving(true);
    setError(null);
    try {
      const currentSlack = integrations.find((item) => item.type === "slack");
      const body = {
        type: "slack" as const,
        config: {
          webhookUrl: slackForm.webhookUrl,
          channel: slackForm.channel,
          mention: slackForm.mention,
        },
        isActive: slackForm.isActive,
      };
      const saved = currentSlack
        ? await patchSystemIntegration(currentSlack.id, body)
        : await createSystemIntegration(body);
      setIntegrations((current) => {
        const others = current.filter((item) => item.type !== "slack");
        return [saved, ...others];
      });
      setSlackForm({
        webhookUrl: "Configured",
        channel: String(saved.config.channel ?? ""),
        mention: String(saved.config.mention ?? ""),
        isActive: saved.isActive,
      });
      setMessage("Slack 연동이 저장되었습니다.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel title="알림 센터" description="시스템 전반의 알림을 확인하고 Slack 웹훅 전송 채널을 관리합니다.">
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as NotificationSeverity | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All severities</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as NotificationType | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All types</option>
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
                <th className="px-3 py-3">Time</th>
                <th className="px-3 py-3">Severity</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Title</th>
                <th className="px-3 py-3">Message</th>
                <th className="px-3 py-3">Channel</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!isLoading && filteredNotifications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    No notifications found.
                  </td>
                </tr>
              ) : (
                filteredNotifications.map((item) => (
                  <tr key={item.id} className={item.isRead ? "bg-white" : "bg-amber-50/30"}>
                    <td className="px-3 py-4">{formatDateTime(item.createdAt)}</td>
                    <td className="px-3 py-4">
                      <StatusBadge tone={severityTone(item.severity)}>{item.severity}</StatusBadge>
                    </td>
                    <td className="px-3 py-4">{item.type}</td>
                    <td className="px-3 py-4 font-medium text-slate-900">{item.title}</td>
                    <td className="px-3 py-4 text-slate-700">{item.message}</td>
                    <td className="px-3 py-4">{item.sentTo}</td>
                    <td className="px-3 py-4">
                      <button type="button" onClick={() => void handleMarkRead(item)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700">
                        {item.isRead ? "Unread" : "Mark Read"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <PagePanel title="Slack Webhook" description="Store the Slack webhook in DB so alert delivery can be enabled without code changes.">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700 md:col-span-2">
            <span className="mb-1 block font-medium">Webhook URL</span>
            <input
              value={slackForm.webhookUrl}
              onChange={(event) => setSlackForm((current) => ({ ...current, webhookUrl: event.target.value }))}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">Channel</span>
            <input value={slackForm.channel} onChange={(event) => setSlackForm((current) => ({ ...current, channel: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">Mention</span>
            <input value={slackForm.mention} onChange={(event) => setSlackForm((current) => ({ ...current, mention: event.target.value }))} placeholder="@admin" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={slackForm.isActive} onChange={(event) => setSlackForm((current) => ({ ...current, isActive: event.target.checked }))} />
            <span>Enable Slack delivery</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => void saveSlackIntegration()} disabled={isSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {isSaving ? "Saving..." : "Save Slack Integration"}
          </button>
        </div>
      </PagePanel>
    </div>
  );
}
