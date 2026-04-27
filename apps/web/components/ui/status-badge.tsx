import type { ReactNode } from "react";

export function StatusBadge(props: {
  tone?: "default" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const className =
    props.tone === "success"
      ? "bg-emerald-100 text-emerald-700"
      : props.tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : props.tone === "danger"
          ? "bg-rose-100 text-rose-700"
          : props.tone === "info"
            ? "bg-blue-100 text-blue-700"
            : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>{props.children}</span>;
}
