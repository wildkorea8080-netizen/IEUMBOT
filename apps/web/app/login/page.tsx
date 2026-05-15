"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ApiClientError, apiClient } from "../../lib/api";
import { clearAdminAccessToken, getAdminAccessToken, setAdminAccessToken } from "../../lib/auth/token";
import type { AdminLoginResponse, AdminRole, AdminSummary } from "../../lib/auth/types";

type AdminMeResponse = {
  admin: AdminSummary;
};

function getReasonMessage(reason: string | null): string | null {
  if (reason === "sessionExpired") {
    return "세션이 만료되었습니다. 다시 로그인해 주세요.";
  }
  if (reason === "authFailed") {
    return "인증 확인에 실패했습니다. 다시 로그인해 주세요.";
  }
  return null;
}

function getDefaultPathByRole(role: AdminRole): string {
  if (role === "super_admin") {
    return "/super-admin/dashboard";
  }
  return "/admin/dashboard";
}

function isNextPathAllowedForRole(nextPath: string, role: AdminRole): boolean {
  if (!nextPath.startsWith("/")) {
    return false;
  }
  if (nextPath.startsWith("/super-admin")) {
    return role === "super_admin";
  }
  if (nextPath.startsWith("/admin")) {
    return role === "institution_admin";
  }
  return false;
}

function resolveRedirectPath(nextPath: string | null, role: AdminRole): string {
  if (nextPath && isNextPathAllowedForRole(nextPath, role)) {
    return nextPath;
  }
  return getDefaultPathByRole(role);
}

function resolvePostLoginPath(nextPath: string | null, admin: AdminSummary): string {
  if (admin.role === "institution_admin" && admin.mustChangePassword === true) {
    return "/admin/change-password";
  }
  return resolveRedirectPath(nextPath, admin.role);
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nextPath = useMemo(() => searchParams.get("next"), [searchParams]);
  const reasonMessage = useMemo(() => getReasonMessage(searchParams.get("reason")), [searchParams]);

  useEffect(() => {
    let isMounted = true;

    async function checkExistingSession() {
      const token = getAdminAccessToken();
      if (!token) {
        return;
      }

      try {
        const me = await apiClient.request<AdminMeResponse>("/admin/auth/me");
        if (!isMounted) {
          return;
        }
        router.replace(resolvePostLoginPath(nextPath, me.admin));
      } catch {
        clearAdminAccessToken();
      }
    }

    void checkExistingSession();
    return () => {
      isMounted = false;
    };
  }, [nextPath, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await apiClient.request<AdminLoginResponse>("/admin/auth/login", {
        method: "POST",
        body: { email, password },
      });
      clearAdminAccessToken();
      setAdminAccessToken(response.accessToken);
      router.replace(resolvePostLoginPath(nextPath, response.admin));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setErrorMessage("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else {
        setErrorMessage("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">관리자 로그인</h1>
        <p className="mt-2 text-sm text-slate-600">IEUMBOT 관리자 인증 화면입니다.</p>

        {reasonMessage ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {reasonMessage}
          </p>
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호를 입력해 주세요."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-600 focus:ring-2"
              autoComplete="current-password"
              required
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
            className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}
