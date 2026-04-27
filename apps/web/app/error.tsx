"use client";

type RootErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RootError({ error, reset }: RootErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-5 shadow-sm">
        <h1 className="text-base font-semibold text-red-700">화면 오류</h1>
        <p className="mt-2 text-sm text-slate-700">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-black"
        >
          다시 시도
        </button>
      </section>
    </main>
  );
}
