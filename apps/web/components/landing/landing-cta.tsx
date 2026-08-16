import Link from "next/link";

/* ── 마무리 CTA ────────────────────────────────────────────── */

export function LandingCta() {
  return (
    <section className="bg-brand-600 py-20">
      <div className="mx-auto w-full max-w-3xl px-5 text-center">
        <h2 className="text-[1.75rem] font-bold leading-snug tracking-tight text-white sm:text-[2.1rem]">
          우리 기관 자료로 먼저 확인해 보세요
        </h2>
        <p className="mt-4 text-[17px] leading-8 text-brand-50">
          담당자 연락처를 남겨 주시면 기관 자료를 함께 살펴보고, 어떤 질문에 어디까지 답할 수 있는지
          직접 보여 드립니다.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/inquiry"
            className="inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
          >
            도입 문의하기
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl border border-white/40 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            관리자 로그인
          </Link>
        </div>
      </div>
    </section>
  );
}
