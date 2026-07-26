"use client";

import { useEffect, useState } from "react";

import { ApiClientError } from "../lib/api";
import {
  getSuperAdminPasswordPolicy,
  updateSuperAdminPasswordPolicy,
  type PasswordPolicy,
} from "../lib/api/super-admin-password-policy";
import { PagePanel } from "./ui/page-panel";

const DEFAULT: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: false,
  requireDigit: true,
  requireSymbol: true,
};

type Toggle = { key: keyof PasswordPolicy; label: string };
const TOGGLES: Toggle[] = [
  { key: "requireUppercase", label: "영문 대문자 포함" },
  { key: "requireLowercase", label: "영문 소문자 포함" },
  { key: "requireDigit", label: "숫자 포함" },
  { key: "requireSymbol", label: "특수문자 포함" },
];

function summarize(p: PasswordPolicy): string {
  const types = [
    p.requireUppercase && "대문자",
    p.requireLowercase && "소문자",
    p.requireDigit && "숫자",
    p.requireSymbol && "특수문자",
  ].filter(Boolean);
  return `${p.minLength}자 이상` + (types.length ? ` + ${types.join("·")} 각 1자 이상` : "");
}

export function SuperAdminPasswordPolicy() {
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    void getSuperAdminPasswordPolicy()
      .then((res) => {
        if (!mounted) return;
        setPolicy(res);
      })
      .catch(() => {
        /* 조회 실패 시 기본값 유지 */
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    // 최소 하나의 문자 종류는 요구하도록 방어(전부 끄면 너무 약함).
    const anyType =
      policy.requireUppercase ||
      policy.requireLowercase ||
      policy.requireDigit ||
      policy.requireSymbol;
    if (!anyType) {
      setMessage({ kind: "err", text: "문자 종류를 최소 1개 이상 요구해야 합니다." });
      setSaving(false);
      return;
    }
    try {
      const res = await updateSuperAdminPasswordPolicy(policy);
      setPolicy(res);
      setMessage({ kind: "ok", text: "비밀번호 정책을 저장했습니다. 이후 모든 비밀번호에 적용됩니다." });
    } catch (error) {
      setMessage({
        kind: "err",
        text:
          error instanceof ApiClientError ? error.message : "저장에 실패했습니다. 다시 시도해 주세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PagePanel
      title="비밀번호 정책"
      description="모든 관리자·기관사용자의 가입·변경·재설정 시 적용되는 전역 비밀번호 규칙입니다."
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          현재 규칙: <span className="font-medium text-slate-800">{summarize(policy)}</span>
        </div>

        <label className="block max-w-xs">
          <span className="mb-1 block text-sm font-medium text-slate-700">최소 길이 (8~64)</span>
          <input
            type="number"
            min={8}
            max={64}
            value={policy.minLength}
            disabled={!loaded}
            onChange={(e) =>
              setPolicy((p) => ({
                ...p,
                minLength: Math.max(8, Math.min(64, Number(e.target.value) || 8)),
              }))
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-700">필수 문자 종류</span>
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(policy[t.key])}
                disabled={!loaded}
                onChange={(e) => setPolicy((p) => ({ ...p, [t.key]: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              {t.label}
            </label>
          ))}
        </div>

        {message ? (
          <p
            className={
              message.kind === "ok"
                ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
                : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            }
          >
            {message.text}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!loaded || saving}
          onClick={() => void save()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "저장 중..." : "정책 저장"}
        </button>
      </div>
    </PagePanel>
  );
}
