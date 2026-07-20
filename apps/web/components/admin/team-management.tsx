"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { ApiClientError, apiClient } from "../../lib/api";
import {
  createTeamMember,
  getTeamMembers,
  resetTeamMemberPassword,
  updateTeamMember,
  type TeamMember,
} from "../../lib/api/team-operations";

type IssuedCredential = { name: string; email: string; password: string };

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function CredentialBanner({
  credential,
  onClose,
}: {
  credential: IssuedCredential;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credential.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 미지원 시 무시 */
    }
  };
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-900">
            임시 비밀번호가 발급되었습니다 — 지금만 표시됩니다
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {credential.name}({credential.email}) 님에게 아래 임시 비밀번호를 전달하세요. 최초 로그인 시 변경이
            필요합니다.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 font-mono text-sm text-slate-800">
              {credential.password}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-emerald-700 hover:text-emerald-900"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function TeamManagement() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [credential, setCredential] = useState<IssuedCredential | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, me] = await Promise.all([
        getTeamMembers(),
        apiClient.request<{ admin: { id: string } }>("/admin/auth/me").catch(() => null),
      ]);
      setMembers(list);
      setMyId(me?.admin.id ?? null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "관리자 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createTeamMember({ name: newName, email: newEmail });
      setCredential({ name: created.name, email: created.email, password: created.temporaryPassword });
      setNewName("");
      setNewEmail("");
      setShowAdd(false);
      await load();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setError("이미 사용 중인 이메일입니다.");
      } else {
        setError("관리자 추가에 실패했습니다. 입력값을 확인해 주세요.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (member: TeamMember) => {
    setBusyId(member.id);
    setError(null);
    try {
      const next = member.status === "active" ? "inactive" : "active";
      const updated = await updateTeamMember(member.id, { status: next });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 400
          ? "본인 계정은 비활성화할 수 없습니다."
          : "상태 변경에 실패했습니다.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (member: TeamMember) => {
    setBusyId(member.id);
    setError(null);
    try {
      const res = await resetTeamMemberPassword(member.id);
      setCredential({ name: member.name, email: member.email, password: res.temporaryPassword });
      await load();
    } catch {
      setError("비밀번호 재설정에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">관리자 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            우리 기관의 관리자를 추가하고 관리합니다. 추가된 관리자는 최초 로그인 시 비밀번호를 변경합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + 관리자 추가
        </button>
      </header>

      {credential ? (
        <CredentialBanner credential={credential} onClose={() => setCredential(null)} />
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {showAdd ? (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">이름 *</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="홍길동"
                required
                maxLength={120}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">이메일 *</span>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@organization.go.kr"
                required
                maxLength={255}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? "추가 중..." : "추가하고 임시 비밀번호 발급"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">이메일</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">최근 로그인</th>
                <th className="px-4 py-3 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.id === myId;
                const active = member.status === "active";
                return (
                  <tr key={member.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{member.name}</span>
                      {isSelf ? (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">나</span>
                      ) : null}
                      {member.mustChangePassword ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                          비번변경 대기
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{member.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {active ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(member.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === member.id}
                          onClick={() => void resetPassword(member)}
                          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          비밀번호 재설정
                        </button>
                        {!isSelf ? (
                          <button
                            type="button"
                            disabled={busyId === member.id}
                            onClick={() => void toggleStatus(member)}
                            className={`rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
                              active
                                ? "border border-red-200 text-red-600 hover:bg-red-50"
                                : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {active ? "비활성화" : "활성화"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    등록된 관리자가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
