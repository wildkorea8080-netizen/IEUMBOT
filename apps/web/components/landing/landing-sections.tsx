import type { ReactNode } from "react";
import Link from "next/link";

import { COMPANY } from "../../lib/company";

/* 랜딩 푸터만 남는다. 섹션들은 각자 파일로 분리되어 있다. */

/**
 * 사업자 정보 항목. 확인되지 않은 값(null)은 거짓을 채우는 대신 항목 자체를 뺀다.
 * lib/company.ts에 값을 넣으면 자동으로 다시 나타난다.
 */
function companyEntries(): { label: string; value: ReactNode }[] {
  const entries: { label: string; value: ReactNode }[] = [
    { label: "상호", value: COMPANY.name },
  ];
  if (COMPANY.representative) {
    entries.push({ label: "대표자", value: COMPANY.representative });
  }
  if (COMPANY.businessNumber) {
    entries.push({ label: "사업자등록번호", value: COMPANY.businessNumber });
  }
  entries.push(
    { label: "주소", value: COMPANY.address },
    {
      label: "문의",
      value: (
        <a href={`mailto:${COMPANY.email}`} className="hover:text-white">
          {COMPANY.email}
        </a>
      ),
    },
    {
      label: "전화",
      value: (
        <a href={`tel:${COMPANY.tel}`} className="hover:text-white">
          {COMPANY.tel}
        </a>
      ),
    },
  );
  return entries;
}

export function LandingFooter() {
  return (
    <footer className="bg-slate-900 py-12">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                이
              </span>
              <span className="text-base font-bold text-white">IEUMBOT</span>
            </div>
            <p className="mt-3 text-[13px] leading-6 text-slate-400">
              공공기관 자료 기반 AI 챗봇 · 근거 없이는 답하지 않습니다
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-300">
            <Link href="/terms" className="hover:text-white">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-white">
              개인정보처리방침
            </Link>
            <Link href="/inquiry" className="hover:text-white">
              도입 문의
            </Link>
            <Link href="/login" className="hover:text-white">
              관리자 로그인
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-[12px] leading-6 text-slate-400">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {companyEntries().map((entry) => (
              <span key={entry.label}>
                {entry.label} {entry.value}
              </span>
            ))}
          </p>
          <p className="mt-4 text-slate-500">© {new Date().getFullYear()} IEUMBOT. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
