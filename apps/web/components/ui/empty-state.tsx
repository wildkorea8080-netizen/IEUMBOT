import type { ReactNode } from "react";

import { AdminIcon, type AdminIconName } from "./admin-icons";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: AdminIconName;
  action?: ReactNode;
};

export function EmptyState({
  title,
  description,
  icon = "empty",
  action,
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-12 text-center">
      <span className="mx-auto inline-flex rounded-2xl bg-white p-3 text-slate-500 shadow-sm ring-1 ring-slate-200">
        <AdminIcon name={icon} className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
