"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiClient } from "../../../lib/api";
import { clearAdminAccessToken, setAdminAccessToken } from "../../../lib/auth/token";
import type { AdminRole, AdminSummary } from "../../../lib/auth/types";

type AdminMeResponse = { admin: AdminSummary };

function defaultPathByRole(role: AdminRole): string {
  return role === "super_admin" ? "/super-admin/dashboard" : "/admin/dashboard";
}

const ERROR_MESSAGES: Record<string, string> = {
  account_disabled: "정지된 계정입니다. 관리자에게 문의해 주세요.",
  state_mismatch: "인증 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.",
  oauth_denied: "SNS 로그인이 취소되었습니다.",
  oauth_error: "SNS 인증 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  provider_disabled: "현재 사용할 수 없는 로그인 방식입니다.",
  server_error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

export default function OAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(rawHash);
    // 토큰이 주소창·히스토리에 남지 않도록 즉시 해시 제거
    window.history.replaceState(null, "", window.location.pathname);

    const errCode = params.get("error");
    if (errCode) {
      setError(ERROR_MESSAGES[errCode] ?? "로그인에 실패했습니다. 다시 시도해 주세요.");
      return;
    }

    const token = params.get("token");
    if (!token) {
      setError("로그인 정보를 받지 못했습니다. 다시 시도해 주세요.");
      return;
    }

    let mounted = true;
    void (async () => {
      try {
        clearAdminAccessToken();
        setAdminAccessToken(token);
        const me = await apiClient.request<AdminMeResponse>("/admin/auth/me");
        if (!mounted) {
          return;
        }
        router.replace(defaultPathByRole(me.admin.role));
      } catch {
        clearAdminAccessToken();
        if (mounted) {
          setError("세션 확인에 실패했습니다. 다시 로그인해 주세요.");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">로그인 실패</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <a
              href="/login"
              className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              로그인 화면으로
            </a>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">로그인 처리 중…</h1>
            <p className="mt-2 text-sm text-slate-600">잠시만 기다려 주세요.</p>
          </>
        )}
      </section>
    </main>
  );
}
