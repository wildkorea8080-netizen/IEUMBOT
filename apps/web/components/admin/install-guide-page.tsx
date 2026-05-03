"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../../lib/api";
import { writeSelectedAdminChatbot } from "../../lib/admin-ui/selected-chatbot";
import { getAdminInstallGuide } from "../../lib/api/install-guide";
import type { AdminInstallGuideItem } from "../../lib/api/install-guide-types";
import { CopyButton } from "../ui/copy-button";
import { PagePanel } from "../ui/page-panel";
import { StatusBadge } from "../ui/status-badge";

const TEXT = {
  title: "\uC124\uCE58 \uC548\uB0B4",
  description:
    "\uAE30\uAD00\uAD00\uB9AC\uC790\uAC00 \uBC30\uC815\uB41C \uC704\uC82F \uC124\uCE58 \uCF54\uB4DC\uB97C \uD655\uC778\uD558\uACE0 \uD648\uD398\uC774\uC9C0 \uB610\uB294 \uD14C\uC2A4\uD2B8 \uD398\uC774\uC9C0\uC5D0 \uBD99\uC5EC \uAC80\uC99D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  loading: "\uC124\uCE58 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uACE0 \uC788\uC2B5\uB2C8\uB2E4.",
  empty: "\uC544\uC9C1 \uBC1C\uAE09\uB41C \uC704\uC82F\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC804\uCCB4\uAD00\uB9AC\uC790\uC5D0\uAC8C \uC704\uC82F \uC0DD\uC131\uC744 \uC694\uCCAD\uD558\uC138\uC694.",
  copySuccess: "\uC124\uCE58 \uCF54\uB4DC\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  copyFail: "\uC124\uCE58 \uCF54\uB4DC \uBCF5\uC0AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  missingWidget: "\uC544\uC9C1 \uBC1C\uAE09\uB41C \uC704\uC82F\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC804\uCCB4\uAD00\uB9AC\uC790\uC5D0\uAC8C \uC704\uC82F \uC0DD\uC131\uC744 \uC694\uCCAD\uD558\uC138\uC694.",
  inactiveWidget: "\uD604\uC7AC \uC704\uC82F\uC774 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
  missingDomain: "\uD5C8\uC6A9 \uB3C4\uBA54\uC778\uC744 \uB4F1\uB85D\uD574\uC57C \uC2E4\uC81C \uC0AC\uC774\uD2B8\uC5D0\uC11C \uB3D9\uC791\uD569\uB2C8\uB2E4.",
  readyWidget: "\uC704\uC82F \uCF54\uB4DC \uC124\uCE58\uC640 \uD5C8\uC6A9 \uB3C4\uBA54\uC778 \uC870\uAC74\uC774 \uBAA8\uB450 \uC900\uBE44\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  widgetInfoTitle: "\uC704\uC82F \uC815\uBCF4",
  widgetInfoDescription: "\uD604\uC7AC \uC120\uD0DD\uD55C \uCC57\uBD07\uC5D0 \uC5F0\uACB0\uB41C \uC704\uC82F \uC815\uBCF4\uC785\uB2C8\uB2E4.",
  statusTitle: "\uC0C1\uD0DC \uC548\uB0B4",
  statusDescription: "\uC6B4\uC601 \uC804\uC5D0 \uD655\uC778\uD574\uC57C \uD560 \uD544\uC218 \uC0C1\uD0DC\uC785\uB2C8\uB2E4.",
  installCodeTitle: "\uC124\uCE58 \uCF54\uB4DC",
  installCodeDescription:
    "\uD648\uD398\uC774\uC9C0 \uAD00\uB9AC\uC790 \uB610\uB294 \uAC1C\uBC1C\uC0AC\uC5D0\uAC8C \uC804\uB2EC\uD560 \uC124\uCE58 \uCF54\uB4DC\uC785\uB2C8\uB2E4.",
  installCodeHint:
    "`/widget.js` 정적 경로와 same-origin `/backend-api` 프록시를 함께 사용해 현재 설정을 불러옵니다.",
  installMethodTitle: "\uC124\uCE58 \uBC29\uBC95",
  installMethodDescription:
    "\uC2E4\uC81C \uD648\uD398\uC774\uC9C0 \uBC18\uC601 \uC2DC \uC804\uB2EC\uD574\uC57C \uD560 \uAC00\uC774\uB4DC\uC785\uB2C8\uB2E4.",
  sampleTitle: "\uC0D8\uD50C \uD14C\uC2A4\uD2B8 \uD398\uC774\uC9C0",
  sampleDescription:
    "OADS \uC2A4\uD0C0\uC77C \uD14C\uC2A4\uD2B8 \uD398\uC774\uC9C0\uC5D0\uC11C \uC704\uC82F \uB178\uCD9C\uACFC \uC751\uB2F5 \uACB0\uACFC\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  chatbotName: "\uCC57\uBD07\uBA85",
  widgetName: "\uC704\uC82F\uBA85",
  status: "\uC0C1\uD0DC",
  domains: "\uD5C8\uC6A9 \uB3C4\uBA54\uC778",
  themeColor: "\uD14C\uB9C8 \uC0C9\uC0C1",
  position: "\uC704\uCE58",
  createdAt: "\uC0DD\uC131\uC77C",
  notIssued: "\uBBF8\uBC1C\uAE09",
  copy: "\uBCF5\uC0AC",
  insertBeforeBody: "HTML\uC758 `</body>` \uC9C1\uC804\uC5D0 \uC0BD\uC785\uD569\uB2C8\uB2E4.",
  sendToAdmin:
    "\uD648\uD398\uC774\uC9C0 \uAD00\uB9AC\uC790 \uB610\uB294 \uAC1C\uBC1C\uC0AC\uC5D0\uAC8C \uC124\uCE58 \uCF54\uB4DC\uB97C \uC804\uB2EC\uD569\uB2C8\uB2E4.",
  registerDomain:
    "\uD5C8\uC6A9 \uB3C4\uBA54\uC778\uC5D0 \uC2E4\uC81C \uD648\uD398\uC774\uC9C0 \uB3C4\uBA54\uC778\uC744 \uB4F1\uB85D\uD574\uC57C \uD569\uB2C8\uB2E4.",
  useHttps: "HTTPS \uD658\uACBD\uC5D0\uC11C \uD14C\uC2A4\uD2B8\uD558\uACE0 \uC6B4\uC601\uD558\uB294 \uAC83\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4.",
  samplePath: "\uD14C\uC2A4\uD2B8 \uACBD\uB85C",
  sampleStep1:
    "\uD14C\uC2A4\uD2B8 \uD398\uC774\uC9C0\uC5D0 \uC704\uC82F \uCF54\uB4DC\uB97C \uBD99\uC5EC \uC6B0\uCE21 \uD558\uB2E8 \uB178\uCD9C \uC5EC\uBD80\uB97C \uD655\uC778\uD569\uB2C8\uB2E4.",
  sampleStep2:
    "\uC9C8\uBB38 \uC785\uB825 \uD6C4 \uB2F5\uBCC0, citation, fallback \uB3D9\uC791\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
  missing: "missing",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Failed to load install guide.";
}

function defaultScript(chatbotId: string): string {
  return `<script
  src="/widget.js"
  data-chatbot-id="${chatbotId}"
  data-api-base-url="/backend-api"
  data-open-on-load="false"
></script>`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong className="mr-2 text-slate-900">{label}</strong>
      <span>{value}</span>
    </div>
  );
}

export function InstallGuidePage() {
  const [items, setItems] = useState<AdminInstallGuideItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await getAdminInstallGuide();
        if (!mounted) return;
        setItems(response.items);
        const preferred = response.items.find((item) => item.hasWidget) ?? response.items[0];
        setSelectedChatbotId(preferred?.chatbotId ?? "");
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

  const selected = useMemo(
    () => items.find((item) => item.chatbotId === selectedChatbotId) ?? null,
    [items, selectedChatbotId],
  );

  useEffect(() => {
    if (!selected) return;
    writeSelectedAdminChatbot({ id: selected.chatbotId, name: selected.chatbotName });
  }, [selected]);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  return (
    <div className="space-y-6">
      <PagePanel title={TEXT.title} description={TEXT.description}>
        {isLoading ? <p className="text-sm text-slate-500">{TEXT.loading}</p> : null}
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {!isLoading && items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">{TEXT.empty}</div>
        ) : null}

        {!isLoading && items.length > 0 ? (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              {items.map((item) => (
                <button
                  key={item.chatbotId}
                  type="button"
                  onClick={() => setSelectedChatbotId(item.chatbotId)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selectedChatbotId === item.chatbotId ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm text-slate-900">{item.chatbotName}</strong>
                    <StatusBadge tone={!item.hasWidget ? "default" : !item.isActive ? "warning" : "success"}>
                      {item.hasWidget ? item.status : TEXT.missing}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{item.widgetName ?? TEXT.notIssued}</p>
                </button>
              ))}
            </div>

            {selected ? (
              <>
                <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
                  <PagePanel title={TEXT.widgetInfoTitle} description={TEXT.widgetInfoDescription}>
                    <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                      <InfoRow label={TEXT.chatbotName} value={selected.chatbotName} />
                      <InfoRow label={TEXT.widgetName} value={selected.widgetName ?? "-"} />
                      <InfoRow label={TEXT.status} value={selected.hasWidget ? selected.status : TEXT.missing} />
                      <InfoRow
                        label={TEXT.domains}
                        value={selected.allowedDomains.length > 0 ? selected.allowedDomains.join(", ") : "-"}
                      />
                      <InfoRow label={TEXT.themeColor} value={selected.themeColor ?? "-"} />
                      <InfoRow label={TEXT.position} value={selected.position ?? "-"} />
                      <InfoRow
                        label={TEXT.createdAt}
                        value={selected.createdAt ? new Date(selected.createdAt).toLocaleString("ko-KR") : "-"}
                      />
                    </div>
                  </PagePanel>

                  <PagePanel title={TEXT.statusTitle} description={TEXT.statusDescription}>
                    <div className="space-y-3 text-sm text-slate-700">
                      {!selected.hasWidget ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">{TEXT.missingWidget}</div>
                      ) : null}
                      {selected.hasWidget && !selected.isActive ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">{TEXT.inactiveWidget}</div>
                      ) : null}
                      {selected.hasWidget && selected.allowedDomains.length === 0 ? (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">{TEXT.missingDomain}</div>
                      ) : null}
                      {selected.hasWidget && selected.isActive && selected.allowedDomains.length > 0 ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">{TEXT.readyWidget}</div>
                      ) : null}
                    </div>
                  </PagePanel>
                </div>

                <PagePanel title={TEXT.installCodeTitle} description={TEXT.installCodeDescription}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">{TEXT.installCodeHint}</p>
                    <CopyButton
                      text={selected.installScript || defaultScript(selected.chatbotId)}
                      label={TEXT.copy}
                      successMessage={TEXT.copySuccess}
                      errorMessage={TEXT.copyFail}
                      disabled={!selected.hasWidget}
                      onCopied={(message) => setCopyMessage(message)}
                    />
                  </div>
                  {copyMessage ? <p className="mt-3 text-sm text-blue-700">{copyMessage}</p> : null}
                  <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                    {selected.installScript || defaultScript(selected.chatbotId)}
                  </pre>
                </PagePanel>

                <div className="grid gap-6 xl:grid-cols-2">
                  <PagePanel title={TEXT.installMethodTitle} description={TEXT.installMethodDescription}>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li>{TEXT.sendToAdmin}</li>
                      <li>{TEXT.insertBeforeBody}</li>
                      <li>{TEXT.registerDomain}</li>
                      <li>{TEXT.useHttps}</li>
                    </ul>
                  </PagePanel>

                  <PagePanel title={TEXT.sampleTitle} description={TEXT.sampleDescription}>
                    <div className="space-y-3 text-sm text-slate-700">
                      <p>
                        {TEXT.samplePath}: <code>/sample-pages/oads-main.html</code>
                      </p>
                      <ul className="space-y-2">
                        <li>{TEXT.sampleStep1}</li>
                        <li>{TEXT.sampleStep2}</li>
                      </ul>
                    </div>
                  </PagePanel>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}
