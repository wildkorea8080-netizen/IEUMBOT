import type { ReactNode } from "react";
import Link from "next/link";

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
            근거 없이는
            <br />
            답하지 않습니다
          </h1>

          <p className="mt-5 max-w-xl text-[17px] leading-8 text-slate-600">
            홈페이지 주소와 안내 문서를 등록하면 IEUMBOT이 자료를 읽고 색인합니다. 모든 답변에 어느
            문서에서 나온 내용인지 출처를 붙이고,{" "}
            <strong className="font-semibold text-slate-900">
              등록된 자료에 근거가 없으면 답을 만들지 않고
            </strong>{" "}
            담당 부서를 안내합니다.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/inquiry"
              className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              도입 문의하기
            </Link>
            <a
              href="#answer-flow"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              답변 방식 살펴보기
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <li className="flex items-center gap-1.5">
              <span className="text-brand-600">✓</span> 답변마다 출처 표시
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-brand-600">✓</span> 개인정보 자동 마스킹
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-brand-600">✓</span> 등록 자료 AI 학습 미사용
            </li>
          </ul>
        </div>

        <ChatPreview />
      </div>
    </section>
  );
}

function ChatPreview() {
  return (
    <div className="landing-rise landing-rise-delay mx-auto w-full max-w-md lg:max-w-none">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-900 px-4 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-bold text-white">
            이
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">○○시청 안내 챗봇</p>
            <p className="text-[11px] text-white/60">등록된 공식 자료 기반 답변</p>
          </div>
          <span className="ml-auto text-[11px] text-white/50">데모 화면</span>
        </div>

        <div className="space-y-3.5 bg-slate-50/70 px-4 py-5">
          <Bubble role="user">주민등록등본 발급하려면 뭐가 필요한가요?</Bubble>

          <Bubble role="bot">
            <p>
              본인이 직접 방문하시는 경우 <strong className="font-semibold">신분증</strong>만
              지참하시면 됩니다. 대리인이 방문하실 때는 위임장, 대리인 신분증, 본인 신분증 사본이
              추가로 필요합니다.
            </p>
            <div className="mt-3 border-t border-slate-100 pt-2.5">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-400">참고한 자료</p>
              <div className="flex flex-wrap gap-1.5">
                <Source>민원실 업무 안내.pdf · 3p</Source>
                <Source>홈페이지 &gt; 민원 안내</Source>
              </div>
            </div>
          </Bubble>

          <Bubble role="user">내년도 예산 규모가 얼마인가요?</Bubble>

          <Bubble role="bot">
            <p className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-500">⚠</span>
              <span>
                등록된 자료에서 관련 근거를 찾지 못했습니다. 정확한 안내를 위해 재정과(☎ 02-000-0000)로
                문의해 주세요.
              </span>
            </p>
            <p className="mt-2.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800">
              근거가 없을 때 그럴듯한 답을 지어내지 않는 것이 IEUMBOT의 기본 동작입니다.
            </p>
          </Bubble>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-4 py-3">
          <div className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-[13px] text-slate-400">
            궁금한 점을 입력해 주세요
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm text-white">
            ↑
          </span>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "bot"; children: ReactNode }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-[13px] leading-6 text-white">
          {children}
        </p>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-6 text-slate-700 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function Source({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700">
      <span aria-hidden>🔗</span>
      {children}
    </span>
  );
}
