"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  getSuperAdminEnforcementLogs,
  getSuperAdminEnforcementPolicies,
  patchSuperAdminEnforcementPolicy,
  resolveSuperAdminEnforcementLog,
} from "../lib/api/super-admin-enforcement";
import type {
  AutoEnforcementLogItem,
  AutoEnforcementPolicyItem,
  EnforcementAction,
} from "../lib/api/super-admin-enforcement-types";
import { AdminModal } from "./ui/admin-modal";
import { PagePanel } from "./ui/page-panel";
import { StatusBadge } from "./ui/status-badge";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "제재 요청에 실패했습니다.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function actionTone(action: EnforcementAction): "warning" | "danger" | "info" {
  if (action === "warn_only") return "info";
  if (action === "read_only") return "warning";
  return "danger";
}

type ResolveState = {
  logId: string;
  reason: string;
} | null;

export function SuperAdminEnforcement() {
  const [policies, setPolicies] = useState<AutoEnforcementPolicyItem[]>([]);
  const [logs, setLogs] = useState<AutoEnforcementLogItem[]>([]);
  const [resolveState, setResolveState] = useState<ResolveState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [policyResponse, logResponse] = await Promise.all([
        getSuperAdminEnforcementPolicies(),
        getSuperAdminEnforcementLogs(),
      ]);
      setPolicies(policyResponse.items);
      setLogs(logResponse.items);
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

  const activeLogs = useMemo(() => logs.filter((item) => !item.resolvedAt), [logs]);

  async function updatePolicy(policyId: string, body: Partial<AutoEnforcementPolicyItem>) {
    try {
      const updated = await patchSuperAdminEnforcementPolicy(policyId, body);
      setPolicies((current) => current.map((item) => (item.id === policyId ? updated : item)));
      setMessage("정책이 수정되었습니다.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    }
  }

  async function resolveLog() {
    if (!resolveState?.reason.trim()) {
      setError("해제 사유를 입력해 주세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const updated = await resolveSuperAdminEnforcementLog(resolveState.logId, {
        reason: resolveState.reason.trim(),
      });
      setLogs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("제재가 해제되었습니다.");
      setResolveState(null);
    } catch (resolveError) {
      setError(getErrorMessage(resolveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PagePanel title="자동 제재 정책" description="결제, 계약, 오류, 보안 이슈에 대한 시스템 반응을 관리합니다.">
        {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">Policy</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Threshold</th>
                <th className="px-3 py-3">Error Window</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td className="px-3 py-4 font-medium text-slate-900">{policy.policyType}</td>
                  <td className="px-3 py-4">
                    <select
                      value={policy.action}
                      onChange={(event) => void updatePolicy(policy.id, { action: event.target.value as EnforcementAction })}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="warn_only">warn_only</option>
                      <option value="read_only">read_only</option>
                      <option value="suspend_chat">suspend_chat</option>
                      <option value="suspend_widget">suspend_widget</option>
                      <option value="suspend_organization">suspend_organization</option>
                    </select>
                  </td>
                  <td className="px-3 py-4">{policy.thresholdPercent ?? "-"}</td>
                  <td className="px-3 py-4">
                    {policy.errorWindowMinutes ?? "-"}
                    {policy.errorCountThreshold ? ` / ${policy.errorCountThreshold}` : ""}
                  </td>
                  <td className="px-3 py-4">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={policy.isActive}
                        onChange={(event) => void updatePolicy(policy.id, { isActive: event.target.checked })}
                      />
                      <span className="text-sm text-slate-700">{policy.isActive ? "active" : "inactive"}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <PagePanel title="Active Restrictions" description="These organizations or chatbots are currently under automatic restriction until manually resolved.">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Policy</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Organization</th>
                <th className="px-3 py-3">Reason</th>
                <th className="px-3 py-3">State</th>
                <th className="px-3 py-3">Resolve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeLogs.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    No active restrictions.
                  </td>
                </tr>
              ) : (
                activeLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-4">{formatDateTime(log.createdAt)}</td>
                    <td className="px-3 py-4">{log.policyType}</td>
                    <td className="px-3 py-4">
                      <StatusBadge tone={actionTone(log.action)}>{log.action}</StatusBadge>
                    </td>
                    <td className="px-3 py-4 text-xs text-slate-600">{log.organizationId}</td>
                    <td className="px-3 py-4 text-slate-700">{log.reason}</td>
                    <td className="px-3 py-4">{log.previousStatus ?? "-"} {"->"} {log.newStatus ?? "-"}</td>
                    <td className="px-3 py-4">
                      <button type="button" onClick={() => setResolveState({ logId: log.id, reason: "" })} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700">
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <PagePanel title="Enforcement History" description="All automatic actions are logged with previous and new status values for auditability.">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Policy</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Reason</th>
                <th className="px-3 py-3">Resolved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-4">{formatDateTime(log.createdAt)}</td>
                  <td className="px-3 py-4">{log.policyType}</td>
                  <td className="px-3 py-4">{log.action}</td>
                  <td className="px-3 py-4 text-slate-700">{log.reason}</td>
                  <td className="px-3 py-4">{formatDateTime(log.resolvedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PagePanel>

      <AdminModal
        open={Boolean(resolveState)}
        title="Resolve Enforcement"
        description="Restore the previous status and record the manual release reason."
        onClose={() => setResolveState(null)}
      >
        <label className="block text-sm text-slate-700">
          <span className="mb-1 block font-medium">Reason</span>
          <textarea
            value={resolveState?.reason ?? ""}
            onChange={(event) => setResolveState((current) => (current ? { ...current, reason: event.target.value } : null))}
            className="min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setResolveState(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
            Cancel
          </button>
          <button type="button" onClick={() => void resolveLog()} disabled={isSaving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {isSaving ? "Resolving..." : "Resolve"}
          </button>
        </div>
      </AdminModal>
    </div>
  );
}
