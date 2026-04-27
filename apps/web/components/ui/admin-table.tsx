import type { ReactNode } from "react";

export function AdminTable(props: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{props.children}</div>;
}
