"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiClientError } from "../../../lib/api";
import { changeAdminPassword } from "../../../lib/api/auth";
import {
  checkPassword,
  DEFAULT_PASSWORD_POLICY,
  getPasswordPolicy,
  passwordHint,
  type PasswordPolicy,
} from "../../../lib/auth/password-policy";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case "CURRENT_PASSWORD_INVALID":
        return "현재 비밀번호가 올바르지 않습니다.";
      case "NEW_PASSWORD_MUST_DIFFER":
        return "새 비밀번호는 현재 비밀번호와 달라야 합니다.";
      case "PASSWORD_LENGTH":
        return "새 비밀번호가 정책의 길이 조건을 충족하지 않습니다.";
      case "PASSWORD_NEEDS_UPPERCASE":
        return "새 비밀번호에 영문 대문자를 1자 이상 포함해 주세요.";
      case "PASSWORD_NEEDS_LOWERCASE":
        return "새 비밀번호에 영문 소문자를 1자 이상 포함해 주세요.";
      case "PASSWORD_NEEDS_DIGIT":
        return "새 비밀번호에 숫자를 1자 이상 포함해 주세요.";
      case "PASSWORD_NEEDS_SYMBOL":
        return "새 비밀번호에 특수문자를 1자 이상 포함해 주세요.";
      default:
        break;
    }
  }
  return "비밀번호 변경에 실패했습니다. 입력값을 확인해 주세요.";
}

export default function AdminChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_PASSWORD_POLICY);

  useEffect(() => {
    let mounted = true;
    void getPasswordPolicy().then((p) => {
      if (mounted) setPolicy(p);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const policyError = checkPassword(policy, newPassword);
    if (policyError) {
      setErrorMessage(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMessage("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changeAdminPassword({ currentPassword, newPassword });
      router.replace("/admin/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">비밀번호 변경</h2>
          <p className="mt-2 text-sm text-slate-600">
            보안을 위해 임시 비밀번호를 새 비밀번호로 변경해주세요.
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">현재 비밀번호</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
              autoComplete="current-password"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">새 비밀번호</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
              autoComplete="new-password"
              required
              minLength={policy.minLength}
            />
            <span className="mt-1 block text-xs text-slate-500">{passwordHint(policy)}</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">새 비밀번호 확인</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
              autoComplete="new-password"
              required
              minLength={policy.minLength}
            />
          </label>

          {errorMessage ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "변경 중..." : "변경"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
