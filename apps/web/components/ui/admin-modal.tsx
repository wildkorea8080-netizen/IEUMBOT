import type { ReactNode } from "react";

export function AdminModal(props: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
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
        <div className="px-6 py-6">{props.children}</div>
      </div>
    </div>
  );
}
