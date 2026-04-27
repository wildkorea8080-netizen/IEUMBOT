import type { ReactNode } from "react";

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">{children}</div>;
}
