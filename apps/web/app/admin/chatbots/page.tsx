"use client";

import { useEffect, useState } from "react";

import { AdminModal } from "../../../components/ui/admin-modal";
import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { writeSelectedAdminChatbot } from "../../../lib/admin-ui/selected-chatbot";
import { createAdminChatbot, getAdminChatbots, patchAdminChatbot } from "../../../lib/api/admin-operations";
import type { AdminChatbotItem } from "../../../lib/api/admin-operations-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case "CHATBOT_NAME_REQUIRED":
        return "챗봇 이름을 입력해 주세요.";
      case "CHATBOT_NAME_CONFLICT":
        return "이미 같은 이름의 챗봇이 있습니다.";
      case "CHATBOT_LIMIT_EXCEEDED":
        return "생성 가능한 챗봇 수를 초과했습니다.";
      case "BILLING_OVER_LIMIT_BLOCKED":
        return "계약 한도 초과로 챗봇을 생성할 수 없습니다.";
      default:
        return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

export default function AdminChatbotsPage() {
  const [items, setItems] = useState<AdminChatbotItem[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = async (preferredChatbotId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAdminChatbots();
      setItems(response.items);

      const nextSelectedId =
        preferredChatbotId && response.items.some((item) => item.id === preferredChatbotId)
          ? preferredChatbotId
          : response.items[0]?.id ?? null;
      setSelectedChatbotId(nextSelectedId);

      if (nextSelectedId) {
        const selected = response.items.find((item) => item.id === nextSelectedId);
        if (selected) {
          writeSelectedAdminChatbot({ id: selected.id, name: selected.name });
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!successMessage && !error) return;
    const timer = window.setTimeout(() => {
      setSuccessMessage(null);
      setError(null);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [successMessage, error]);

  const changeStatus = async (chatbotId: string, status: string) => {
    try {
      await patchAdminChatbot(chatbotId, { status });
      await load(chatbotId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const createChatbot = async () => {
    if (!createForm.name.trim()) {
      setError("챗봇 이름을 입력해 주세요.");
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const created = await createAdminChatbot({
        name: createForm.name.trim(),
        descriptionText: createForm.description.trim() || null,
      });
      setIsCreateModalOpen(false);
      setCreateForm({ name: "", description: "" });
      setSuccessMessage("챗봇이 생성되었습니다.");
      await load(created.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <PagePanel title="챗봇 설정" description="챗봇 목록과 상태를 관리합니다.">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsCreateModalOpen(true);
            }}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            챗봇 생성
          </button>
        </div>

        {isLoading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
        {!isLoading && items.length === 0 ? <p className="text-sm text-slate-500">챗봇이 없습니다.</p> : null}

        {items.length > 0 ? (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">챗봇명</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">문서 수</th>
                  <th className="px-3 py-2">웹소스 수</th>
                  <th className="px-3 py-2">수정일</th>
                  <th className="px-3 py-2">ON/OFF</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-t border-slate-100 ${selectedChatbotId === item.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
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

      <AdminModal
        open={isCreateModalOpen}
        title="챗봇 생성"
        description="로그인된 기관 관리자 계정의 organizationId 범위로 생성됩니다."
        onClose={() => {
          if (isCreating) return;
          setIsCreateModalOpen(false);
          setCreateForm({ name: "", description: "" });
        }}
      >
        <div className="space-y-4">
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">이름</span>
            <input
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="예: 입학 상담 챗봇"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">설명</span>
            <textarea
              rows={4}
              value={createForm.description}
              onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="선택 입력"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCreateModalOpen(false);
                setCreateForm({ name: "", description: "" });
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void createChatbot()}
              disabled={isCreating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isCreating ? "생성 중..." : "생성"}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
