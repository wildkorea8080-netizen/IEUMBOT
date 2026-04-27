"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { superAdminNavItems } from "./super-admin-nav";

export function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <div>
          <p className="text-sm font-semibold text-slate-900">IEUMBOT 전체 관리자</p>
          <p className="text-xs text-slate-500">시스템 및 계약 운영</p>
        </div>
      </div>
      <nav className="space-y-1 p-4">
        {superAdminNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-xl px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
