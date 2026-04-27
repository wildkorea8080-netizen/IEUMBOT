"use client";

import { useEffect, useMemo, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import {
  deleteAdminDocument,
  getAdminDocuments,
  patchAdminDocument,
} from "../../../lib/api/admin-operations";
import type { AdminDocumentItem } from "../../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

export default function DocumentsPage() {
  const [items, setItems] = useState<AdminDocumentItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasFilter = useMemo(() => query.trim().length > 0 || status.trim().length > 0, [query, status]);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAdminDocuments({
        q: query.trim() || undefined,
        status: status.trim() || undefined,
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

  const updateStatus = async (id: string, nextStatus: string) => {
    try {
      await patchAdminDocument(id, { status: nextStatus });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const removeDoc = async (id: string) => {
    try {
      await deleteAdminDocument(id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <PagePanel title="지식관리" description="PDF/웹 문서를 조회하고 상태를 관리합니다.">
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_180px_auto]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="문서명 검색"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">전체 상태</option>
            <option value="active">active</option>
            <option value="deprecated">deprecated</option>
            <option value="inactive">inactive</option>
          </select>
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
        {!isLoading && items.length === 0 ? (
          <p className="text-sm text-slate-500">{hasFilter ? "조건에 맞는 문서가 없습니다." : "문서가 없습니다."}</p>
        ) : null}

        {items.length > 0 ? (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">제목</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">소스</th>
                  <th className="px-3 py-2">최신 버전</th>
                  <th className="px-3 py-2">수정일</th>
                  <th className="px-3 py-2">액션</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-900">{item.title}</td>
                    <td className="px-3 py-2">{item.status}</td>
                    <td className="px-3 py-2">{item.sourceType ?? "-"}</td>
                    <td className="px-3 py-2">
                      {item.latestVersionNumber ?? "-"} / {item.latestVersionStatus ?? "-"}
                    </td>
                    <td className="px-3 py-2">{new Date(item.updatedAt).toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void updateStatus(item.id, "active")}
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          active
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateStatus(item.id, "deprecated")}
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          deprecated
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeDoc(item.id)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          삭제
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

