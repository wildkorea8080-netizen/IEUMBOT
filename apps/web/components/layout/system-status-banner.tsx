"use client";

import { useEffect, useState } from "react";

import { ApiClientError, apiClient } from "../../lib/api";
import { getPublicSystemStatus, listPublicAnnouncements } from "../../lib/api/system-controls";
import type { AdminSummary } from "../../lib/auth/types";
import type {
  PublicAnnouncementItem,
  PublicAnnouncementType,
  PublicSystemStatusResponse,
} from "../../lib/api/system-controls-types";

type SystemStatusBannerProps = {
  scope: "admin" | "super_admin";
};

type AdminMeResponse = {
  admin: AdminSummary;
};

function bannerTone(type: PublicAnnouncementType): string {
  if (type === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (type === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export function SystemStatusBanner({ scope }: SystemStatusBannerProps) {
  const [announcements, setAnnouncements] = useState<PublicAnnouncementItem[]>([]);
  const [status, setStatus] = useState<PublicSystemStatusResponse["maintenance"] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let organizationId: string | null | undefined = undefined;
        if (scope === "admin") {
          try {
            const me = await apiClient.request<AdminMeResponse>("/admin/auth/me");
            organizationId = me.admin.organizationId;
          } catch (error) {
            if (!(error instanceof ApiClientError) || error.status !== 503) {
              organizationId = undefined;
            }
          }
        }

        const [announcementResponse, systemStatusResponse] = await Promise.all([
          listPublicAnnouncements(organizationId),
          getPublicSystemStatus(),
        ]);
        if (cancelled) return;
        setAnnouncements(announcementResponse.announcements);
        setStatus(systemStatusResponse.maintenance);
      } catch {
        if (cancelled) return;
        setAnnouncements([]);
        setStatus(null);
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [scope]);

  if ((!status || !status.isActive) && announcements.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      {status?.isActive ? (
        <div className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800">
          <strong className="font-semibold uppercase tracking-wide">점검 안내</strong>
          <p className="mt-1">
            {status.message || "시스템 점검이 진행 중입니다."}
            {status.mode ? ` (${status.mode})` : ""}
          </p>
        </div>
      ) : null}
      {announcements.map((item, index) => (
        <div key={`${item.title}-${index}`} className={`rounded-xl border px-4 py-3 text-sm ${bannerTone(item.type)}`}>
          <strong className="font-semibold">{item.title}</strong>
          <p className="mt-1 whitespace-pre-wrap">{item.message}</p>
        </div>
      ))}
    </div>
  );
}
