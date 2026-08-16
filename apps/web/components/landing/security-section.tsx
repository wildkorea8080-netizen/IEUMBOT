"use client";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

/**
 * 도입 검토 단계에서 실제로 받는 질문들. 진술문("~합니다")을 질문형으로
 * 바꿨다. 담당자는 이 항목들을 확인하러 오는 거지 읽으러 오는 게 아니다.
 * 자물쇠 아이콘은 뺐다 — 질문형 제목이면 아이콘 없이도 읽힌다.
 */
const SECURITY_QA = [
  {
    q: "우리 자료가 AI 학습에 쓰이나요?",
    a: "쓰이지 않습니다. 답변 생성에 사용하는 외부 AI 사업자와의 계약상 전송된 자료를 모델 학습에 사용하지 않습니다.",
  },
  {
    q: "다른 기관 자료가 섞이지 않나요?",
    a: "기관 단위로 데이터를 나누어 처리합니다. 다른 기관의 자료가 검색되거나 답변에 섞이지 않습니다.",
  },
  {
    q: "누가 관리자로 들어올 수 있나요?",
    a: "관리자 권한을 기관 관리자와 담당자로 나눕니다. 접속 기록이 남고 전송 구간은 모두 암호화합니다.",
  },
  {
    q: "자료를 외부에 보내기 어려운데요?",
    a: "민감도가 높아 외부 전송이 어려운 경우 별도 협의를 통해 구성 방식을 조정할 수 있습니다.",
  },
  {
    q: "이용자가 주민번호를 적으면요?",
    a: "자동으로 가려서 처리하고, 가린 이력이 관리자 화면에 기록으로 남습니다. 개인 신상이 걸린 질문은 답을 만들지 않고 담당 부서로 안내합니다.",
  },
  {
    q: "누가 설정을 바꿨는지 알 수 있나요?",
    a: "관리자가 무엇을 언제 바꿨는지 이력이 남습니다. 감사 대응 시 그대로 확인할 수 있습니다.",
  },
];

export function SecuritySection() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="border-b border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Security"
          title="도입 전에 확인하시는 것들"
          description="검토 단계에서 가장 많이 받는 질문을 정리했습니다."
        />

        <div ref={ref} className="mt-12 grid gap-4 md:grid-cols-2">
          {SECURITY_QA.map((item) => (
            <div
              key={item.q}
              className="landing-reveal rounded-2xl border border-slate-200 bg-white p-6"
            >
              <h3 className="text-[16px] font-bold leading-snug text-slate-900">{item.q}</h3>
              <p className="mt-2 text-[14px] leading-7 text-slate-600">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
