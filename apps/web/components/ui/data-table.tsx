import type { ReactNode } from "react";

type DataTableProps = {
  children: ReactNode;
  minWidthClassName?: string;
  className?: string;
};

export function DataTable({ children, minWidthClassName = "", className = "" }: DataTableProps) {
  return (
    <div className={["overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm", className].join(" ")}>
      <div className="overflow-x-auto">
        <table className={["w-full text-left text-sm", minWidthClassName].join(" ")}>{children}</table>
      </div>
    </div>
  );
}
