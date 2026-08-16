"use client";

import { usePinnedProgress } from "./use-pinned-progress";

/* ── 답변 생성 4단계 (핵심 신뢰 서사) ─────────────────────────
   스크롤이 곧 진행 바다. 순서 자체가 메시지인 내용이라, 사용자가
   자기 속도로 읽으면서도 단계를 건너뛰지 않게 고정해 둔다. */

const FLOW_STEPS = [
  {
    step: "STEP 01",
    title: "정해 둔 답이 있으면 그대로 나갑니다",
    body: "관리자가 FAQ로 지정해 둔 질문은 AI가 새로 문장을 만들지 않고 지정된 답변을 그대로 내보냅니다. 민감하거나 자주 바뀌는 안내는 이렇게 100% 통제할 수 있습니다.",
    tag: "관리자 통제",
  },
  {
    step: "STEP 02",
    title: "우리가 올린 자료에서만 찾습니다",
    body: "질문과 관련된 문단을 골라냅니다. 검색 대상은 기관이 등록한 자료와, 관리자가 직접 지정한 공공 API뿐입니다. 임의로 인터넷을 뒤지지 않습니다.",
    tag: "승인된 출처만",
  },
  {
    step: "STEP 03",
    title: "확실하지 않으면 답하지 않습니다",
    body: "찾아낸 근거의 관련도 점수가 기준에 미치지 못하면 답변을 생성하지 않습니다. 억지로 문장을 만들어 내는 대신, 모른다고 말하도록 설계했습니다.",
    tag: "환각 차단",
  },
  {
    step: "STEP 04",
    title: "어디서 나온 답인지 같이 보여줍니다",
    body: "어느 문서 어느 부분에서 나온 답인지 링크로 함께 보여줍니다. 근거를 찾지 못한 질문은 담당 부서 연락처로 안내하고, 관리자 화면에 기록으로 남깁니다.",
    tag: "출처 표시 · 기록",
  },
];

export function AnswerFlowSection() {
  const { ref, activeIndex, pinned } = usePinnedProgress<HTMLDivElement>(FLOW_STEPS.length);

  return (
    <section id="answer-flow" className="scroll-mt-20 border-b border-slate-200 bg-slate-900 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-200">Answer Flow</p>
          <h2 className="mt-3 text-[1.75rem] font-bold leading-snug tracking-tight text-white sm:text-[2.1rem]">
            그런데 AI가 틀리면요?
          </h2>
          <p className="mt-4 text-[17px] leading-8 text-slate-300">
            가장 많이 걱정하시는 부분입니다. IEUMBOT은 질문 하나에 아래 네 단계를 그대로 거칩니다.
          </p>
        </div>

        <div ref={ref} className="mt-12 lg:h-[280vh]">
          <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center">
            <ol className="w-full space-y-3">
              {FLOW_STEPS.map((item, index) => {
                // pinned가 false면(모바일) 전부 펼친다. 고정이 풀린 화면에서
                // 본문이 접혀 있으면 읽을 방법이 없다.
                const on = !pinned || index === activeIndex;
                return (
                  <li
                    key={item.step}
                    className={`rounded-2xl border p-6 transition-all duration-[550ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                      on
                        ? "border-brand-400 bg-white/[0.10] lg:translate-x-2"
                        : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    <p
                      className={`text-xs font-bold tracking-widest ${on ? "text-brand-200" : "text-slate-500"}`}
                    >
                      {item.step}
                    </p>
                    <h3
                      className={`mt-3 text-[17px] font-bold leading-snug ${on ? "text-white" : "text-slate-400"}`}
                    >
                      {item.title}
                    </h3>
                    <p
                      className="overflow-hidden text-[14px] leading-7 text-slate-300 transition-all duration-[550ms]"
                      style={{
                        maxHeight: on ? "8rem" : "0rem",
                        opacity: on ? 1 : 0,
                        marginTop: on ? "0.75rem" : "0rem",
                      }}
                    >
                      {item.body}
                    </p>
                    {on ? (
                      <span className="mt-4 inline-block rounded-md bg-brand-500/20 px-2.5 py-1 text-[12px] font-semibold text-brand-100">
                        {item.tag}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-3xl rounded-xl border border-white/10 bg-white/[0.04] px-6 py-5 text-center text-[15px] leading-7 text-slate-300">
          모든 대화는 관리자 콘솔에 그대로 남습니다. 어떤 질문에 어떤 근거로 답했는지, 어떤 질문에
          답하지 못했는지 나중에도 확인할 수 있습니다.
        </p>
      </div>
    </section>
  );
}
