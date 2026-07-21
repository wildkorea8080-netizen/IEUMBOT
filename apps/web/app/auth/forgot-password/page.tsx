"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";

import { ApiClientError } from "../../../lib/api";
import { forgotPassword, resetErrorMessage } from "../../../lib/api/signup-operations";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      // 서버는 계정 존재 여부를 알려주지 않는다 — 화면 문구도 동일하게 유지.
      setSentTo(email);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError
          ? resetErrorMessage(error.code)
          : "요청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
        {sentTo ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
              ✉️
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">재설정 메일을 보냈습니다</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <span className="font-medium text-slate-800">{sentTo}</span> 으로 가입된 계정이 있다면
              <br />
              비밀번호 재설정 링크를 보내드렸습니다.
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              메일이 보이지 않으면 스팸함을 확인해 주세요. 링크는 일정 시간이 지나면 만료됩니다.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              로그인 화면으로
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">비밀번호 재설정</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              가입하신 이메일 주소를 입력하시면 재설정 링크를 보내드립니다.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">이메일</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="이메일 주소 예시: example@domain.com"
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none ring-brand-600 focus:ring-2"
                  autoComplete="email"
                  required
                  maxLength={255}
                />
              </label>

              {errorMessage ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-md bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "보내는 중..." : "재설정 링크 받기"}
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
