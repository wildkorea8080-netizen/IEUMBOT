"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import { ApiClientError } from "../../../lib/api";
import { resetErrorMessage, resetPassword } from "../../../lib/api/signup-operations";
import { PASSWORD_HINT, checkPasswordPolicy } from "../../../lib/auth/password-policy";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const policyError = checkPasswordPolicy(password);
    if (policyError) {
      setErrorMessage(policyError);
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token ?? "", password);
      setDone(true);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError
          ? resetErrorMessage(error.code)
          : "비밀번호 재설정에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
        {done ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
              ✓
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">비밀번호가 변경되었습니다</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              새 비밀번호로 로그인해 주세요.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              로그인하러 가기
            </Link>
          </div>
        ) : token === "" ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-900">잘못된 접근입니다</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              재설정 토큰이 없습니다. 메일의 링크로 접속해 주세요.
            </p>
            <Link
              href="/auth/forgot-password"
              className="mt-6 inline-block rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              재설정 링크 다시 받기
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">새 비밀번호 설정</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              사용하실 새 비밀번호를 입력해 주세요.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">새 비밀번호</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={PASSWORD_HINT}
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none ring-brand-600 focus:ring-2"
                  autoComplete="new-password"
                  required
                  maxLength={200}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  새 비밀번호 재입력
                </span>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder="비밀번호를 한 번 더 입력하세요."
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none ring-brand-600 focus:ring-2"
                  autoComplete="new-password"
                  required
                  maxLength={200}
                />
              </label>

              {errorMessage ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || token === null}
                className="w-full rounded-md bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "변경 중..." : "비밀번호 변경"}
              </button>
            </form>

            <div className="mt-5 text-center">
              <Link href="/login" className="text-sm text-slate-500 hover:text-slate-700">
                로그인 화면으로
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
