import type { ReactNode } from "react";

import { AdminIcon, type AdminIconName } from "./admin-icons";

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: AdminIconName;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
};

const TONE_CLASS: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StatCard({ label, value, hint, icon, tone = "primary" }: StatCardProps) {
  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
          {hint ? <div className="mt-2 text-sm text-slate-500">{hint}</div> : null}
        </div>
        {icon ? (
          <span className={["inline-flex rounded-xl p-2 ring-1", TONE_CLASS[tone]].join(" ")}>
            <AdminIcon name={icon} className="h-5 w-5" />
          </span>
        ) : null}
      </div>
    </article>
  );
}
