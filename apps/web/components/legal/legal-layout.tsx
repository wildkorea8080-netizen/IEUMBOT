import type { ReactNode } from "react";
import Link from "next/link";

/**
 * 약관/개인정보처리방침 공통 레이아웃.
 * 확정되지 않은 사업자 정보는 <Blank>로 표시해 눈에 띄게 남겨둔다.
 */
export function LegalLayout({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <article className="mx-auto w-full max-w-3xl rounded-lg border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10">
        <header className="border-b border-slate-100 pb-5">
          <p className="text-sm font-semibold text-brand-600">IEUMBOT</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">시행일: {effectiveDate}</p>
        </header>

        <div className="legal-body mt-7 space-y-7 text-[15px] leading-7 text-slate-700">
          {children}
        </div>

        <footer className="mt-10 border-t border-slate-100 pt-5 text-sm text-slate-500">
          <Link href="/login" className="hover:text-slate-700 hover:underline">
            로그인 화면으로
          </Link>
          <span className="mx-2 text-slate-300">|</span>
          <Link href="/terms" className="hover:text-slate-700 hover:underline">
            이용약관
          </Link>
          <span className="mx-2 text-slate-300">|</span>
          <Link href="/privacy" className="hover:text-slate-700 hover:underline">
            개인정보처리방침
          </Link>
        </footer>
      </article>
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 marker:text-slate-400">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ol>
  );
}

/**
 * 사업자 정보 표시. lib/company.ts의 값이 채워지면 그대로 출력하고,
 * 아직 null이면 눈에 띄는 자리표시를 남긴다.
 */
export function Field({ value, label }: { value: string | null; label: string }) {
  if (value) {
    return <>{value}</>;
  }
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[13px] font-medium text-amber-900">
      [{label}]
    </span>
  );
}
