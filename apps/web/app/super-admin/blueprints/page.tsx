"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../../../lib/api";
import {
  applySuperAdminBlueprint,
  createSuperAdminBlueprint,
  listSuperAdminBlueprints,
} from "../../../lib/api/super-admin-operations";
import type { SuperAdminBlueprintItem } from "../../../lib/api/super-admin-operations-types";
import { listSuperAdminOrganizations } from "../../../lib/api/super-admin-organizations";
import type { SuperAdminOrganizationListItem } from "../../../lib/api/super-admin-organizations-types";

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case "SOURCE_CHATBOT_NOT_FOUND":
        return "선택한 기관에 복제할 챗봇이 없습니다.";
      case "ORGANIZATION_NOT_FOUND":
        return "기관을 찾을 수 없습니다.";
      case "BLUEPRINT_NOT_FOUND":
        return "Blueprint를 찾을 수 없습니다.";
      case "BLUEPRINT_SNAPSHOT_MISSING":
        return "Blueprint 스냅샷이 손상되었습니다.";
      default:
        return error.message || "요청을 처리하지 못했습니다.";
    }
  }
  if (error instanceof Error) return error.message;
  return "요청을 처리하지 못했습니다.";
}

export default function SuperAdminBlueprintsPage() {
  const [blueprints, setBlueprints] = useState<SuperAdminBlueprintItem[]>([]);
  const [organizations, setOrganizations] = useState<SuperAdminOrganizationListItem[]>([]);
  const [sourceOrganizationId, setSourceOrganizationId] = useState("");
  const [targetOrganizationId, setTargetOrganizationId] = useState("");
  const [selectedBlueprintId, setSelectedBlueprintId] = useState("");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [blueprintResponse, organizationResponse] = await Promise.all([
        listSuperAdminBlueprints(),
        listSuperAdminOrganizations({ page: 1, pageSize: 100 }),
      ]);
      setBlueprints(blueprintResponse.items);
      setOrganizations(organizationResponse.items);
      setSelectedBlueprintId((current) => current || blueprintResponse.items[0]?.blueprintId || "");
      setSourceOrganizationId((current) => current || organizationResponse.items[0]?.id || "");
      setTargetOrganizationId((current) => current || organizationResponse.items[0]?.id || "");
    } catch (loadError) {
      setError(errorMessage(loadError));
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
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  const recentBlueprint = useMemo(() => {
    return [...blueprints]
      .filter((item) => item.lastUsedAt)
      .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))[0];
  }, [blueprints]);

  async function handleCreate() {
    if (!sourceOrganizationId) {
      setError("Blueprint를 생성할 기관을 선택하세요.");
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const created = await createSuperAdminBlueprint({ sourceOrganizationId });
      setMessage("Blueprint가 생성되었습니다.");
      setSelectedBlueprintId(created.blueprintId);
      await loadData();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleApply() {
    if (!selectedBlueprintId || !targetOrganizationId) {
      setError("적용할 Blueprint와 대상 기관을 선택하세요.");
      return;
    }
    setIsApplying(true);
    setError(null);
    try {
      await applySuperAdminBlueprint(selectedBlueprintId, { targetOrganizationId, overwriteExisting });
      setMessage(overwriteExisting ? "Blueprint가 기존 설정에 적용되었습니다." : "Blueprint로 새 챗봇 설정을 생성했습니다.");
      await loadData();
    } catch (applyError) {
      setError(errorMessage(applyError));
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <main className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">등록 Blueprint</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{blueprints.length.toLocaleString("ko-KR")}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">최근 사용 Blueprint</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{recentBlueprint?.chatbotName || "-"}</p>
          <p className="mt-1 text-sm text-slate-500">{formatDateTime(recentBlueprint?.lastUsedAt)}</p>
        </div>
      </section>

      {(message || error) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Blueprint 생성</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select
              value={sourceOrganizationId}
              onChange={(event) => setSourceOrganizationId(event.target.value)}
              className="min-h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={isCreating || !sourceOrganizationId}
              className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isCreating ? "생성 중" : "Blueprint 생성"}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Blueprint 적용</h2>
          <div className="mt-4 grid gap-3">
            <select
              value={selectedBlueprintId}
              onChange={(event) => setSelectedBlueprintId(event.target.value)}
              className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              {blueprints.map((blueprint) => (
                <option key={blueprint.blueprintId} value={blueprint.blueprintId}>
                  {blueprint.organizationName} / {blueprint.chatbotName}
                </option>
              ))}
            </select>
            <select
              value={targetOrganizationId}
              onChange={(event) => setTargetOrganizationId(event.target.value)}
              className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(event) => setOverwriteExisting(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              기존 챗봇 운영 설정 overwrite
            </label>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={isApplying || !selectedBlueprintId || !targetOrganizationId}
              className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isApplying ? "적용 중" : "적용"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Blueprint 목록</h2>
        </div>
        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">불러오는 중입니다.</p>
        ) : blueprints.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">등록된 Blueprint가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">기관명</th>
                  <th className="px-5 py-3">챗봇명</th>
                  <th className="px-5 py-3">생성일</th>
                  <th className="px-5 py-3">최근 사용</th>
                  <th className="px-5 py-3 text-right">사용횟수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {blueprints.map((blueprint) => (
                  <tr key={blueprint.blueprintId} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-900">{blueprint.organizationName}</td>
                    <td className="px-5 py-4 text-slate-700">{blueprint.chatbotName}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(blueprint.createdAt)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(blueprint.lastUsedAt)}</td>
                    <td className="px-5 py-4 text-right font-medium text-slate-900">
                      {blueprint.usageCount.toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
