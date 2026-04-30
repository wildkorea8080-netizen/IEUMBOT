import type { ReactNode } from "react";

export function StatusBadge(props: {
  tone?: "default" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const className =
    props.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : props.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : props.tone === "danger"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : props.tone === "info"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-tight ${className}`}
    >
      {props.children}
    </span>
  );
}
