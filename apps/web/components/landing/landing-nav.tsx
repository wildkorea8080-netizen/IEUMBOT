"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "#answer-flow", label: "답변 방식" },
  { href: "#features", label: "핵심 기능" },
  { href: "#console", label: "관리 콘솔" },
  { href: "#steps", label: "도입 절차" },
  { href: "#use-cases", label: "활용 분야" },
];

export function LandingNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            이
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">IEUMBOT</span>
        </Link>

        <ul className="hidden items-center gap-7 lg:flex">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-[15px] font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-4 py-2 text-[15px] font-medium text-slate-600 hover:text-slate-900 sm:block"
          >
            로그인
          </Link>
          <Link
            href="/inquiry"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-slate-700"
          >
            도입 문의
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label="메뉴 열기"
            aria-expanded={isOpen}
            className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <span className="text-xl leading-none">{isOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </nav>

      {isOpen ? (
        <ul className="border-t border-slate-200 bg-white px-5 py-2 lg:hidden">
          {[...NAV_ITEMS, { href: "/login", label: "로그인" }].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="block py-3 text-[15px] font-medium text-slate-700"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
