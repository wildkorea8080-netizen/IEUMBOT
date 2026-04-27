"use client";

type AdminErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: AdminErrorProps) {
  return (
    <section className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-red-700">관리자 화면 오류</h2>
      <p className="mt-2 text-sm text-slate-700">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-black"
      >
        다시 불러오기
      </button>
    </section>
  );
}
