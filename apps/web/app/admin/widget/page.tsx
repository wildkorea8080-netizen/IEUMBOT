"use client";

import { useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getAdminWidget, patchAdminWidget } from "../../../lib/api/admin-operations";
import type { AdminWidgetResponse } from "../../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

export default function WidgetPage() {
  const [chatbotId, setChatbotId] = useState("");
  const [domainsInput, setDomainsInput] = useState("");
  const [data, setData] = useState<AdminWidgetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    if (!chatbotId.trim()) {
      setError("chatbotId를 입력하세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await getAdminWidget(chatbotId.trim());
      setData(res);
      setDomainsInput((res.allowedDomains ?? []).join(", "));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const saveDomains = async () => {
    if (!chatbotId.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const allowedDomains = domainsInput
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      const res = await patchAdminWidget(chatbotId.trim(), { allowedDomains });
      setData(res);
      setSuccess("도메인 설정이 저장되었습니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const toggleActive = async (nextValue: boolean) => {
    if (!chatbotId.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await patchAdminWidget(chatbotId.trim(), { isActive: nextValue });
      setData(res);
      setSuccess(nextValue ? "위젯이 활성화되었습니다." : "위젯이 비활성화되었습니다.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <PagePanel title="위젯 설정" description="도메인, 활성 상태, 설치 스크립트를 관리합니다.">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={chatbotId}
            onChange={(e) => setChatbotId(e.target.value)}
            placeholder="chatbotId"
            className="w-full max-w-xl rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            조회
          </button>
        </div>
        {isLoading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        {data ? (
          <div className="space-y-3 rounded border border-slate-200 p-3 text-sm">
            <p>위젯 ID: {data.id}</p>
            <p>상태: {data.status}</p>
            <label className="block">
              <span className="text-xs text-slate-600">allowedDomains (콤마 구분)</span>
              <input
                value={domainsInput}
                onChange={(e) => setDomainsInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void saveDomains()}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
              >
                도메인 저장
              </button>
              <button
                type="button"
                onClick={() => void toggleActive(true)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
              >
                활성화
              </button>
              <button
                type="button"
                onClick={() => void toggleActive(false)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
              >
                비활성화
              </button>
            </div>
            <div>
              <p className="text-xs text-slate-600">설치 스크립트</p>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                {data.installScript ?? "등록된 스크립트가 없습니다."}
              </pre>
            </div>
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}

