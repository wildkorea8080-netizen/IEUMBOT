"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import { ApiClientError } from "../../../lib/api";
import {
  getSignupConfig,
  memberSignup,
  memberSignupErrorMessage,
  resendVerification,
} from "../../../lib/api/signup-operations";
import { PASSWORD_HINT, checkPasswordPolicy } from "../../../lib/auth/password-policy";

export default function MemberSignupPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; org: string; sent: boolean } | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sent">("idle");

  useEffect(() => {
    let mounted = true;
    void getSignupConfig().then((config) => {
      if (mounted) setReady(config.memberSignupReady);
    });
    return () => {
      mounted = false;
    };
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
    if (!orgCode.trim()) {
      setErrorMessage("기관 코드를 입력해 주세요.");
      return;
    }
    if (!agreed) {
      setErrorMessage("이용약관 및 개인정보처리방침에 동의해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await memberSignup({
        email,
        password,
        orgCode: orgCode.trim(),
        termsAgreed: agreed,
      });
      setDone({ email: res.email, org: res.organizationName, sent: res.verificationSent });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError
          ? memberSignupErrorMessage(error.code)
          : "가입 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
        {ready === false ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-900">기관사용자 가입</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              현재 기관사용자 가입이 열려 있지 않습니다. 기관관리자에게 문의해 주세요.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              로그인 화면으로
            </Link>
          </div>
        ) : done ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
              ✉️
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">가입 신청이 접수되었습니다</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <span className="font-medium text-slate-800">{done.org}</span>에 가입 신청되었습니다.
              <br />
              1) <span className="font-medium text-slate-800">{done.email}</span> 으로 보낸 인증
              메일로 이메일을 인증하고,
              <br />
              2) 기관관리자의 <span className="font-medium text-slate-800">승인</span>이 완료되면
              로그인할 수 있습니다.
            </p>

            {!done.sent ? (
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                인증 메일 발송에 실패했습니다. 잠시 후 재발송하거나 기관관리자에게 문의해 주세요.
              </p>
            ) : null}

            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await resendVerification(done.email);
                  setResendState("sent");
                }}
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                {resendState === "sent" ? "재발송했습니다" : "인증 메일 재발송"}
              </button>
              <Link href="/login" className="text-sm text-slate-500 hover:text-slate-700">
                로그인 화면으로
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">기관사용자 가입</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              소속 기관의 코드를 입력해 가입을 신청합니다. 이메일 인증 후 기관관리자 승인이 완료되면
              로그인할 수 있습니다.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">기관 코드</span>
                <input
                  value={orgCode}
                  onChange={(event) => setOrgCode(event.target.value)}
                  placeholder="기관관리자에게 받은 기관 코드"
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none ring-brand-600 focus:ring-2"
                  required
                  maxLength={120}
                />
              </label>

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

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">비밀번호</span>
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
                <span className="mb-1 block text-sm font-medium text-slate-700">비밀번호 재입력</span>
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

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  IEUMBOT{" "}
                  <a href="/terms" target="_blank" rel="noreferrer" className="underline hover:text-brand-600">
                    이용약관
                  </a>{" "}
                  및{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="underline hover:text-brand-600">
                    개인정보처리방침
                  </a>
                  에 동의합니다.
                </span>
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
                {isSubmitting ? "신청 중..." : "가입 신청"}
              </button>

              <p className="text-center">
                <Link href="/login" className="text-sm text-slate-500 hover:text-slate-700">
                  로그인 화면으로
                </Link>
              </p>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
