"use client";

import { useEffect, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatLogs } from "../../../lib/api/admin-operations";
import type { AdminChatLogItem } from "../../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

export default function LogsPage() {
  const [chatbotId, setChatbotId] = useState("");
  const [items, setItems] = useState<AdminChatLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAdminChatLogs({
        chatbotId: chatbotId.trim() || undefined,
        limit: 200,
      });
      setItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <PagePanel title="대화 로그" description="질문/답변, 실패 케이스, citation 요약을 확인합니다.">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={chatbotId}
            onChange={(e) => setChatbotId(e.target.value)}
            placeholder="chatbotId 필터 (선택)"
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
        {!isLoading && items.length === 0 ? <p className="text-sm text-slate-500">로그가 없습니다.</p> : null}
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{item.metadataJson.question ?? "(질문 없음)"}</p>
                <p className="mt-1 text-slate-600 line-clamp-2">{item.metadataJson.answer ?? "(응답 없음)"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  outcome: {item.metadataJson.outcome ?? "-"} | chatbotId: {item.chatbotId} |{" "}
                  {new Date(item.createdAt).toLocaleString("ko-KR")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  citation 수: {Array.isArray(item.metadataJson.citationSummary) ? item.metadataJson.citationSummary.length : 0}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}

