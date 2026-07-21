"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ApiClientError } from "../../../lib/api";
import { verifyEmail } from "../../../lib/api/signup-operations";

type State = "verifying" | "success" | "error";

function errorText(code: string | undefined): string {
  switch (code) {
    case "TOKEN_EXPIRED":
      return "인증 링크가 만료되었습니다. 로그인 화면에서 인증 메일을 다시 받아 주세요.";
    case "INVALID_TOKEN":
      return "유효하지 않은 인증 링크입니다. 메일의 링크를 다시 확인해 주세요.";
    case "SIGNUP_DISABLED":
      return "현재 회원가입이 열려 있지 않습니다.";
    default:
      return "인증에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("error");
      setMessage("인증 토큰이 없습니다. 메일의 링크로 접속해 주세요.");
      return;
    }

    let mounted = true;
    void (async () => {
      try {
        const res = await verifyEmail(token);
        if (!mounted) return;
        setState("success");
        setMessage(res.email);
      } catch (error) {
        if (!mounted) return;
        setState("error");
        setMessage(
          error instanceof ApiClientError ? errorText(error.code) : errorText(undefined),
        );
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 text-center shadow-sm">
        {state === "verifying" ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">이메일 인증 중…</h1>
            <p className="mt-2 text-sm text-slate-600">잠시만 기다려 주세요.</p>
          </>
        ) : state === "success" ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
              ✓
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">이메일 인증 완료</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <span className="font-medium text-slate-800">{message}</span> 인증이 완료되었습니다.
              <br />
              이제 로그인하실 수 있습니다.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              로그인하러 가기
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">인증 실패</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              로그인 화면으로
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
