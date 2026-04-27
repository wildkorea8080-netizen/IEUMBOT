"use client";

import { useEffect, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getAdminChatbots, patchAdminChatbot } from "../../../lib/api/admin-operations";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

export default function AdminChatbotsPage() {
  const [items, setItems] = useState<AdminChatbotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAdminChatbots();
      setItems(response.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const changeStatus = async (chatbotId: string, status: string) => {
    try {
      await patchAdminChatbot(chatbotId, { status });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <PagePanel title="챗봇 설정" description="챗봇 목록과 상태를 관리합니다.">
        {isLoading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {!isLoading && items.length === 0 ? <p className="text-sm text-slate-500">챗봇이 없습니다.</p> : null}
        {items.length > 0 ? (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">챗봇명</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">문서 수</th>
                  <th className="px-3 py-2">웹 소스 수</th>
                  <th className="px-3 py-2">수정일</th>
                  <th className="px-3 py-2">ON/OFF</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-900">{item.name}</td>
                    <td className="px-3 py-2">{item.status}</td>
                    <td className="px-3 py-2">{item.documentCount}</td>
                    <td className="px-3 py-2">{item.websiteCount}</td>
                    <td className="px-3 py-2">{new Date(item.updatedAt).toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void changeStatus(item.id, "active")}
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          ON
                        </button>
                        <button
                          type="button"
                          onClick={() => void changeStatus(item.id, "suspended")}
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          OFF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}

