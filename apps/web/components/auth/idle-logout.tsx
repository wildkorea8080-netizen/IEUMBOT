"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiClient } from "../../lib/api";
import { clearAdminAccessToken, getAdminAccessToken } from "../../lib/auth/token";

// 10분 무반응 → 자동 로그아웃. 마지막 1분은 경고 모달로 안내.
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const WARNING_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000;
// 탭 간 공유 — 어느 탭에서든 활동하면 전체 타이머가 리셋된다.
const LAST_ACTIVITY_KEY = "ieum:last-activity";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

function readLastActivity(): number {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : Date.now();
  } catch {
    return Date.now();
  }
}

function writeLastActivity(ts: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } catch {
    /* 저장 실패 시 무시(프라이빗 모드 등) */
  }
}

export function IdleLogout() {
  const router = useRouter();
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const lastWriteRef = useRef(0);
  const loggedOutRef = useRef(false);

  const markActivity = useCallback(() => {
    const now = Date.now();
    // 쓰기 스로틀 — 이벤트마다 localStorage 쓰지 않도록.
    if (now - lastWriteRef.current >= ACTIVITY_WRITE_THROTTLE_MS) {
      lastWriteRef.current = now;
      writeLastActivity(now);
    }
    setRemainingSec(null);
  }, []);

  const doLogout = useCallback(async () => {
    if (loggedOutRef.current) return;
    loggedOutRef.current = true;
    try {
      await apiClient.request<void>("/admin/auth/logout", { method: "POST" });
    } catch {
      /* best-effort */
    } finally {
      clearAdminAccessToken();
      router.replace("/login?reason=idleTimeout");
    }
  }, [router]);

  useEffect(() => {
    // 진입 시 활동 시각 초기화(공유 값이 오래됐어도 즉시 로그아웃되지 않도록).
    const now = Date.now();
    lastWriteRef.current = now;
    writeLastActivity(now);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true });
    }

    const interval = window.setInterval(() => {
      if (!getAdminAccessToken()) return; // 이미 로그아웃 상태면 무시
      const elapsed = Date.now() - readLastActivity();
      if (elapsed >= IDLE_TIMEOUT_MS) {
        setRemainingSec(0);
        void doLogout();
      } else if (elapsed >= IDLE_TIMEOUT_MS - WARNING_MS) {
        setRemainingSec(Math.max(1, Math.ceil((IDLE_TIMEOUT_MS - elapsed) / 1000)));
      } else {
        setRemainingSec(null);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity);
      }
      window.clearInterval(interval);
    };
  }, [markActivity, doLogout]);

  if (remainingSec === null) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">자동 로그아웃 안내</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          장시간 활동이 없어 곧 자동 로그아웃됩니다.
          <br />
          <span className="font-semibold text-brand-600">{remainingSec}초</span> 후 로그아웃됩니다.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={markActivity}
            className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            계속 사용하기
          </button>
          <button
            type="button"
            onClick={() => void doLogout()}
            className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
