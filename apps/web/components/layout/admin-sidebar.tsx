"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { adminNavItems } from "./admin-nav";

export function AdminSidebar() {
  const pathname = usePathname();
  const sectionMap = new Map<string, Array<(typeof adminNavItems)[number]>>();
  adminNavItems.forEach((item) => {
    const current = sectionMap.get(item.section) ?? [];
    current.push(item);
    sectionMap.set(item.section, current);
  });

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <div>
          <p className="text-sm font-semibold text-slate-900">IEUMBOT 기관 관리자</p>
          <p className="text-xs text-slate-500">운영 전용 관리자 화면</p>
        </div>
      </div>
      <nav className="space-y-5 p-4">
        {Array.from(sectionMap.entries()).map(([section, items]) => (
          <div key={section}>
            <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-slate-400">{section}</p>
            <div className="space-y-1">
              {items.map((item) => {
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
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
