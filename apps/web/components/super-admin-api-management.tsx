"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  activateSuperAdminApiConfig,
  createSuperAdminApiConfig,
  deactivateSuperAdminApiConfig,
  deleteSuperAdminApiConfig,
  listSuperAdminApiConfigs,
  patchSuperAdminApiConfig,
  setDefaultSuperAdminApiConfig,
} from "../lib/api/super-admin-api";
import type {
  SuperAdminApiConfigItem,
  SuperAdminApiConfigUpsertRequest,
} from "../lib/api/super-admin-api-types";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

type FormState = {
  provider: string;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  embeddingModel: string;
  monthlyBudgetLimit: string;
  memo: string;
  isActive: boolean;
  isDefault: boolean;
};

const EMPTY_FORM: FormState = {
  provider: "openai",
  displayName: "",
  apiKey: "",
  baseUrl: "",
  defaultModel: "",
  embeddingModel: "",
  monthlyBudgetLimit: "",
  memo: "",
  isActive: true,
  isDefault: false,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "API 설정 요청에 실패했습니다.";
}

function toForm(item: SuperAdminApiConfigItem | null): FormState {
  if (!item) return EMPTY_FORM;
  return {
    provider: item.provider,
    displayName: item.displayName,
    apiKey: "",
    baseUrl: item.baseUrl ?? "",
    defaultModel: item.defaultModel ?? "",
    embeddingModel: item.embeddingModel ?? "",
    monthlyBudgetLimit: item.monthlyBudgetLimit != null ? String(item.monthlyBudgetLimit) : "",
    memo: item.memo ?? "",
    isActive: item.isActive,
    isDefault: item.isDefault,
  };
}

function toRequest(form: FormState): SuperAdminApiConfigUpsertRequest {
  return {
    provider: form.provider,
    displayName: form.displayName.trim(),
    apiKey: form.apiKey.trim() || undefined,
    baseUrl: form.baseUrl.trim() || undefined,
    defaultModel: form.defaultModel.trim() || undefined,
    embeddingModel: form.embeddingModel.trim() || undefined,
    monthlyBudgetLimit: form.monthlyBudgetLimit ? Number(form.monthlyBudgetLimit) : null,
    memo: form.memo.trim() || undefined,
    isActive: form.isActive,
    isDefault: form.isDefault,
  };
}

export function SuperAdminApiManagement() {
  const [items, setItems] = useState<SuperAdminApiConfigItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("new");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  async function loadItems() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listSuperAdminApiConfigs();
      setItems(response.items);
      const nextSelected = response.items.find((item) => item.id === selectedId) ?? response.items[0] ?? null;
      setSelectedId(nextSelected?.id ?? "new");
      setForm(toForm(nextSelected));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      if (selectedId === "new") {
        if (!form.apiKey.trim()) {
          setError("새 설정에는 API 키가 필요합니다.");
          setIsSaving(false);
          return;
        }
        await createSuperAdminApiConfig(toRequest(form));
        setMessage("API 설정을 생성했습니다.");
      } else {
        await patchSuperAdminApiConfig(selectedId, toRequest(form));
        setMessage("API 설정을 수정했습니다.");
      }
      await loadItems();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    try {
      setError(null);
      await action();
      setMessage(successMessage);
      await loadItems();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    }
  }

  function selectItem(item: SuperAdminApiConfigItem | null) {
    setSelectedId(item?.id ?? "new");
    setForm(toForm(item));
    setError(null);
    setMessage(null);
  }

  return (
    <div className="space-y-6">
      <PagePanel
        title="공용 API 관리"
        description="LLM 제공자별 API 키, 모델, 기본 실행 설정을 관리합니다."
      >
        {message ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => selectItem(null)}
              className={`w-full rounded-2xl border p-4 text-left ${selectedId === "new" ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"}`}
            >
              <strong className="text-sm text-slate-900">새 API 설정</strong>
              <p className="mt-1 text-xs text-slate-500">공용 제공자 설정을 등록합니다.</p>
            </button>

            {isLoading ? <p className="text-sm text-slate-500">API 설정을 불러오는 중...</p> : null}

            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectItem(item)}
                className={`w-full rounded-2xl border p-4 text-left ${selectedId === item.id ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-slate-900">{item.displayName}</strong>
                  <div className="flex gap-2">
                    {item.isDefault ? <StatusBadge tone="info">기본값</StatusBadge> : null}
                    <StatusBadge tone={item.isActive ? "success" : "warning"}>
                      {item.isActive ? "활성" : "비활성"}
                    </StatusBadge>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {item.provider} / {item.defaultModel ?? "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500">마스킹 키: {item.maskedKey}</p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">제공자</span>
                <select
                  value={form.provider}
                  onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="openai">openai</option>
                  <option value="azure_openai">azure_openai</option>
                  <option value="anthropic">anthropic</option>
                  <option value="custom">custom</option>
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">표시 이름</span>
                <input
                  value={form.displayName}
                  onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700 md:col-span-2">
                <span className="mb-1 block font-medium">API 키</span>
                <input
                  value={form.apiKey}
                  onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder={selectedItem ? "교체할 때만 새 키를 입력하세요." : "필수"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                {selectedItem ? (
                  <span className="mt-1 block text-xs text-slate-500">
                    현재 원본 키는 표시되지 않습니다. 마스킹 키: {selectedItem.maskedKey}
                  </span>
                ) : null}
              </label>

              <label className="text-sm text-slate-700 md:col-span-2">
                <span className="mb-1 block font-medium">기본 URL</span>
                <input
                  value={form.baseUrl}
                  onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">기본 모델</span>
                <input
                  value={form.defaultModel}
                  onChange={(event) => setForm((current) => ({ ...current, defaultModel: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">임베딩 모델</span>
                <input
                  value={form.embeddingModel}
                  onChange={(event) => setForm((current) => ({ ...current, embeddingModel: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">월 예산 한도</span>
                <input
                  value={form.monthlyBudgetLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, monthlyBudgetLimit: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                활성
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
                />
                기본값
              </label>

              <label className="text-sm text-slate-700 md:col-span-2">
                <span className="mb-1 block font-medium">메모</span>
                <textarea
                  value={form.memo}
                  onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                {selectedItem ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(() => activateSuperAdminApiConfig(selectedItem.id), "API 설정을 활성화했습니다.")
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    >
                      활성화
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(() => deactivateSuperAdminApiConfig(selectedItem.id), "API 설정을 비활성화했습니다.")
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    >
                      비활성화
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(() => setDefaultSuperAdminApiConfig(selectedItem.id), "기본 API 설정을 변경했습니다.")
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    >
                      기본값 설정
                    </button>
                  </>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(toForm(selectedItem))}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={isSaving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {isSaving ? "저장 중..." : "저장"}
                </button>
                {selectedItem ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("이 API 설정을 삭제하시겠습니까?")) return;
                      void runAction(() => deleteSuperAdminApiConfig(selectedItem.id), "API 설정을 삭제했습니다.");
                    }}
                    className="rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-700"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </PagePanel>
    </div>
  );
}
