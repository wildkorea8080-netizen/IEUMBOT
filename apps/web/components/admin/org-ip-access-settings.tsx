"use client";

import { useEffect, useState } from "react";

import { ApiClientError } from "../../lib/api";
import {
  getOrganizationIpAccess,
  updateOrganizationIpAccess,
  type OrganizationIpAccess,
} from "../../lib/api/organization";

function errorText(code: string | undefined): string {
  switch (code) {
    case "CURRENT_IP_MUST_BE_INCLUDED":
      return "현재 접속 IP가 목록에 포함돼야 저장할 수 있습니다(본인 잠금 방지).";
    case "IP_ENTRY_INVALID":
      return "형식이 올바르지 않은 IP/CIDR 항목이 있습니다. 예: 203.0.113.5 또는 203.0.113.0/24";
    case "IP_LIST_INVALID":
      return "IP 목록 형식이 올바르지 않습니다.";
    default:
      return "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export function OrgIpAccessSettings() {
  const [data, setData] = useState<OrganizationIpAccess | null>(null);
  const [entries, setEntries] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    void getOrganizationIpAccess()
      .then((res) => {
        if (!mounted) return;
        setData(res);
        setEntries(res.allowedIps);
      })
      .catch(() => {
        /* 조회 실패 시 빈 상태 유지 */
      });
    return () => {
      mounted = false;
    };
  }, []);

  const addEntry = (value: string) => {
    const v = value.trim();
    if (!v || entries.includes(v)) return;
    setEntries((prev) => [...prev, v]);
    setInput("");
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await updateOrganizationIpAccess(entries);
      setData(res);
      setEntries(res.allowedIps);
      setMessage({
        kind: "ok",
        text: res.enabled
          ? "IP 접근제어를 저장했습니다. 목록 밖 IP는 로그인·접근이 차단됩니다."
          : "IP 제한을 해제했습니다(모든 IP 허용).",
      });
    } catch (error) {
      setMessage({
        kind: "err",
        text: error instanceof ApiClientError ? errorText(error.code) : errorText(undefined),
      });
    } finally {
      setSaving(false);
    }
  };

  const currentIp = data?.currentIp ?? null;
  const currentIncluded = currentIp ? entries.includes(currentIp) : false;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        관리자 콘솔에 접속할 수 있는 IP를 제한합니다. 목록에 IP/CIDR를 추가하면 그 외 IP에서는
        로그인과 접근이 차단됩니다. <strong>목록을 비우면 제한이 해제</strong>되어 모든 IP에서
        접근할 수 있습니다.
      </p>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        현재 접속 IP:{" "}
        <span className="font-mono font-medium text-slate-800">{currentIp ?? "확인 불가"}</span>
        {currentIp && !currentIncluded && entries.length > 0 ? (
          <button
            type="button"
            onClick={() => addEntry(currentIp)}
            className="ml-2 rounded border border-brand-300 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
          >
            + 현재 IP 추가
          </button>
        ) : null}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEntry(input);
            }
          }}
          placeholder="예: 203.0.113.5 또는 203.0.113.0/24"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none ring-brand-600 focus:ring-2"
        />
        <button
          type="button"
          onClick={() => addEntry(input)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          추가
        </button>
      </div>

      {entries.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {entries.map((entry) => (
            <li key={entry} className="flex items-center justify-between px-3 py-2">
              <span className="font-mono text-sm text-slate-800">
                {entry}
                {entry === currentIp ? (
                  <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    현재 IP
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => setEntries((prev) => prev.filter((e) => e !== entry))}
                className="text-xs text-slate-400 hover:text-red-500"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500">
          등록된 IP가 없습니다. 제한이 해제된 상태(모든 IP 허용)입니다.
        </p>
      )}

      {entries.length > 0 && currentIp && !currentIncluded ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ 현재 접속 IP({currentIp})가 목록에 없습니다. 이대로 저장하면 본인이 잠기므로 저장이
          거부됩니다. &ldquo;현재 IP 추가&rdquo;로 포함해 주세요.
        </p>
      ) : null}

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
        disabled={saving || !data}
        onClick={() => void save()}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "저장 중..." : "IP 접근제어 저장"}
      </button>
    </div>
  );
}
