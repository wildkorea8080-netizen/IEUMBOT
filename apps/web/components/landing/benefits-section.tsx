"use client";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

/**
 * 효과 여섯 가지. 기능 세 장(자료 등록·설명 가능·개인정보)을 대체한다.
 * 같은 내용을 담당자가 쓰는 말로 다시 썼다 — "출처 표시"가 아니라
 * "어디서 나온 답인지 보여준다".
 */
const BENEFITS = [
  {
    title: "같은 질문을 다시 설명하지 않습니다",
    body: "“서류 뭐 필요해요”, “몇 시까지 해요”. 홈페이지에 이미 있는 내용은 챗봇이 먼저 받습니다.",
  },
  {
    title: "퇴근 후에도 안내가 계속됩니다",
    body: "근무시간이 끝난 뒤 들어온 문의도 그 자리에서 안내됩니다. 다음 날 아침 민원으로 쌓이지 않습니다.",
  },
  {
    title: "틀린 안내로 민원이 생기지 않습니다",
    body: "확실하지 않으면 답하지 않습니다. 근거를 못 찾으면 담당 부서 연락처를 안내합니다.",
  },
  {
    title: "자료만 올리면 준비가 끝납니다",
    body: "PDF·한글·워드·엑셀과 홈페이지 주소를 그대로 등록하면 됩니다. 스캔한 문서도 읽습니다.",
  },
  {
    title: "개인정보는 자동으로 걸러집니다",
    body: "이용자가 주민번호나 연락처를 적어도 자동으로 가립니다. 걸러낸 기록도 남습니다.",
  },
  {
    title: "무엇이 부족한지 알려줍니다",
    body: "답하지 못한 질문을 모아 보여줍니다. 어떤 자료를 더 올려야 하는지 알 수 있습니다.",
  },
];

export function BenefitsSection() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section id="features" className="scroll-mt-20 border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading eyebrow="Benefits" title="이렇게 좋아집니다" />
        <div ref={ref} className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((item) => (
            <div
              key={item.title}
              className="landing-reveal rounded-2xl border border-slate-200 bg-slate-50/60 p-6 transition-colors hover:border-brand-300"
            >
              <h3 className="text-[16px] font-bold leading-snug text-slate-900">{item.title}</h3>
              <p className="mt-2.5 text-[14px] leading-7 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
