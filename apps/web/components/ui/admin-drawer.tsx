import type { ReactNode } from "react";

export function AdminDrawer(props: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{props.title}</h3>
            {props.description ? <p className="text-sm text-slate-500">{props.description}</p> : null}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            닫기
          </button>
        </div>
        <div className="space-y-6 px-6 py-6">{props.children}</div>
      </div>
    </div>
  );
}
