"use client";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

/**
 * 관리 콘솔 소개. 실제 화면은 40개인데 여섯 개만 보여주고 있었다.
 * 열두 개로 넓히되 네 묶음으로 눌러 담아 한 화면에서 훑히게 한다.
 *
 * 이름은 전부 담당자 말로 바꿨다 — "가드레일"이 아니라 "답하면 안 되는 것",
 * "에스컬레이션"이 아니라 "담당자에게 넘김".
 */
const CONSOLE_GROUPS = [
  {
    group: "운영",
    items: [
      { title: "대화 로그", body: "어떤 질문에 어떻게 답했는지 전부 확인합니다." },
      { title: "답 못한 질문", body: "안내하지 못한 질문을 모아 보여줍니다." },
      { title: "빠른 질문", body: "자주 찾는 안내를 첫 화면 버튼으로 띄웁니다." },
    ],
  },
  {
    group: "품질",
    items: [
      { title: "답변 품질 점검", body: "잘 답하고 있는지 주기적으로 알려줍니다." },
      { title: "부족한 자료 찾기", body: "어떤 자료를 더 올려야 하는지 알려줍니다." },
      { title: "자료 검토", body: "올린 자료를 챗봇이 쓰기 전에 사람이 확인합니다." },
    ],
  },
  {
    group: "보안",
    items: [
      { title: "개인정보 차단 기록", body: "주민번호 같은 입력을 가린 이력이 남습니다." },
      { title: "변경 이력", body: "누가 언제 무엇을 바꿨는지 남습니다." },
      { title: "팀 권한", body: "기관 관리자와 담당자 권한을 나눕니다." },
    ],
  },
  {
    group: "분석",
    items: [
      { title: "주제별 통계", body: "어떤 주제 문의가 많은지 보여줍니다." },
      { title: "시간대 분석", body: "언제 문의가 몰리는지 보여줍니다." },
      { title: "이용 현황", body: "응대 건수와 추이를 한눈에 봅니다." },
    ],
  },
];

export function ConsoleSection() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section id="console" className="scroll-mt-20 border-b border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Console"
          title="혼자서도 운영됩니다"
          description="챗봇은 만들어 두면 낡습니다. 무엇이 부족한지 알려 주고, 담당자가 직접 고칠 수 있게 했습니다."
        />

        <div ref={ref} className="mt-12 space-y-8">
          {CONSOLE_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-600">
                {group.group}
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {group.items.map((item) => (
                  <div
                    key={item.title}
                    className="landing-reveal rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all duration-[220ms] hover:-translate-y-[3px] hover:border-brand-400"
                  >
                    <h3 className="text-[15px] font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-6 text-slate-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
