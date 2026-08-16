import Link from "next/link";

import { WidgetDemo } from "./widget-demo";

/**
 * 히어로 — 제품을 설명하는 대신 실제 답변 형태를 그대로 보여준다.
 * 근거가 있을 때(출처 표시)와 없을 때(담당 부서 안내)를 한 화면에 나란히 둔 것이 핵심.
 *
 * 애니메이션은 transform만 사용한다. opacity로 숨기면 JS/애니메이션이 실행되지 않는
 * 환경에서 본문이 영영 보이지 않는다.
 */
export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-16rem] h-[32rem] w-[64rem] -translate-x-1/2 rounded-full bg-brand-100/50 blur-3xl"
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 py-16 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-center lg:gap-12 lg:py-24">
        <div className="landing-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-brand-700">
            공공기관 전용 문서 기반 AI 챗봇
          </p>

          <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.25] tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.2]">
            전화는 줄고
            <br />
            안내는 24시간
          </h1>

          <p className="mt-5 max-w-xl text-[17px] leading-8 text-slate-600">
            홈페이지에 이미 있는 내용을 묻는 전화, 하루에 몇 통 받으시나요? IEUMBOT이 먼저 받습니다.{" "}
            <strong className="font-semibold text-slate-900">
              등록된 자료에 근거가 없으면 지어내지 않고
            </strong>{" "}
            담당 부서를 안내하기 때문에, 틀린 안내로 문제될 일은 없습니다.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/inquiry"
              className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              도입 문의하기
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              무료로 체험하기
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <li className="flex items-center gap-1.5">
              <span className="text-brand-600">✓</span> 어디서 나온 답인지 표시
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-brand-600">✓</span> 주민번호를 적어도 자동으로 가림
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-brand-600">✓</span> 우리 자료를 AI 학습에 쓰지 않음
            </li>
          </ul>
        </div>

        <WidgetDemo />
      </div>
    </section>
  );
}
