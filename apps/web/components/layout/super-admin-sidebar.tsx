"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminIcon } from "../ui/admin-icons";
import { superAdminNavItems } from "./super-admin-nav";

export function SuperAdminSidebar() {
  const pathname = usePathname();
  const sectionMap = new Map<string, Array<(typeof superAdminNavItems)[number]>>();

  superAdminNavItems.forEach((item) => {
    const current = sectionMap.get(item.section) ?? [];
    current.push(item);
    sectionMap.set(item.section, current);
  });

  return (
    <aside className="hidden w-80 shrink-0 border-r border-slate-200/80 bg-slate-950 text-slate-200 lg:block">
      <div className="border-b border-slate-800 px-6 py-6">
        <div className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200">
          SUPER ADMIN
        </div>
        <div className="mt-4">
          <p className="text-lg font-semibold tracking-tight text-white">IEUMBOT Console</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            조직, 계약, 결제, 플랫폼 운영 상태를 중앙에서 관리합니다.
          </p>
        </div>
      </div>

      <nav className="space-y-6 p-4">
        {Array.from(sectionMap.entries()).map(([section, items]) => (
          <div key={section}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
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
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex rounded-xl p-2",
                        isActive ? "bg-indigo-50 text-indigo-700" : "bg-slate-800 text-slate-300",
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
