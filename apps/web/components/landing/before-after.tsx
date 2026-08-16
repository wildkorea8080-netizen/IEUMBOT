"use client";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

/**
 * 담당자의 하루 대조. 고민 세 가지를 나열하던 섹션을 대체한다.
 * 문제를 설명하는 것보다 "지금"과 "도입 후"를 나란히 두는 편이 세다.
 */
const ROWS = [
  {
    when: "아침",
    before: "어제 저녁 이후 쌓인 문의부터 처리",
    after: "밤사이 문의는 이미 안내 완료",
  },
  { when: "오전", before: "“서류 뭐 필요해요” 열 번째 설명", after: "반복 질문은 챗봇이 받음" },
  { when: "오후", before: "홈페이지에 있는 내용을 또 안내", after: "판단이 필요한 건만 담당자에게" },
  { when: "퇴근 후", before: "전화 못 받음 → 다음 날 민원", after: "안내는 계속" },
  {
    when: "감사 준비",
    before: "언제 뭐라 안내했는지 기억에 의존",
    after: "전 대화 기록에서 바로 확인",
  },
  { when: "실적 보고", before: "셀 방법이 없음", after: "응대 건수·시간대 자동 집계" },
];

export function BeforeAfter() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Before / After"
          title="담당자의 하루가 이렇게 바뀝니다"
          description="공공기관 민원 담당자가 실제로 겪는 하루를 그대로 옮겼습니다."
        />

        <div ref={ref} className="mx-auto mt-12 max-w-4xl">
          <div className="mb-3 hidden grid-cols-[5.5rem_1fr_1fr] gap-3 px-1 text-xs font-bold uppercase tracking-widest sm:grid">
            <span />
            <span className="text-slate-400">지금</span>
            <span className="text-brand-600">도입 후</span>
          </div>

          {ROWS.map((row) => (
            <div
              key={row.when}
              className="landing-reveal mb-2.5 grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[5.5rem_1fr_1fr] sm:gap-3"
            >
              <span className="flex items-center text-[13px] font-semibold text-slate-500">
                {row.when}
              </span>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[14px] leading-6 text-slate-500">
                <span className="mr-1.5 font-semibold text-slate-400 sm:hidden">지금</span>
                {row.before}
              </p>
              <p className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3.5 text-[14px] font-medium leading-6 text-slate-800">
                <span className="mr-1.5 font-semibold text-brand-600 sm:hidden">도입 후</span>
                {row.after}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
