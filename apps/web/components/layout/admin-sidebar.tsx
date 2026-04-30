"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminIcon } from "../ui/admin-icons";
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
    <aside className="hidden w-80 shrink-0 border-r border-slate-200/80 bg-white lg:block">
      <div className="border-b border-slate-200/80 px-6 py-6">
        <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          ORG ADMIN
        </div>
        <div className="mt-4">
          <p className="text-lg font-semibold tracking-tight text-slate-950">IEUMBOT Workspace</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            기관 운영, 지식, 대화 품질을 관리하는 SaaS 관리자 화면입니다.
          </p>
        </div>
      </div>

      <nav className="space-y-6 p-4">
        {Array.from(sectionMap.entries()).map(([section, items]) => (
          <div key={section}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              {section}
            </p>
            <div className="space-y-1">
              {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-all",
                      isActive
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex rounded-xl p-2",
                        isActive ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500",
                      ].join(" ")}
                    >
                      <AdminIcon name={item.icon} className="h-4 w-4" />
                    </span>
                    <span className="font-medium">{item.label}</span>
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
