/* ── 답변 생성 4단계 (핵심 신뢰 서사) ───────────────────────── */

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
  return (
    <section id="answer-flow" className="scroll-mt-20 border-b border-slate-200 bg-slate-900 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-200">Answer Flow</p>
          <h2 className="mt-3 text-[1.75rem] font-bold leading-snug tracking-tight text-white sm:text-[2.1rem]">
            질문 하나에 네 단계를 거칩니다
          </h2>
          <p className="mt-4 text-[17px] leading-8 text-slate-300">
            “왜 이렇게 답했는지” 설명할 수 없는 챗봇은 공공기관에서 쓸 수 없습니다. IEUMBOT은 모든
            답변이 아래 순서를 그대로 따릅니다.
          </p>
        </div>

        <ol className="mt-12 grid gap-4 lg:grid-cols-4">
          {FLOW_STEPS.map((item) => (
            <li
              key={item.step}
              className="relative rounded-2xl border border-white/10 bg-white/[0.06] p-6"
            >
              <p className="text-xs font-bold tracking-widest text-brand-200">{item.step}</p>
              <h3 className="mt-3 text-[17px] font-bold leading-snug text-white">{item.title}</h3>
              <p className="mt-3 text-[14px] leading-7 text-slate-300">{item.body}</p>
              <span className="mt-4 inline-block rounded-md bg-brand-500/20 px-2.5 py-1 text-[12px] font-semibold text-brand-100">
                {item.tag}
              </span>
            </li>
          ))}
        </ol>

        <p className="mx-auto mt-10 max-w-3xl rounded-xl border border-white/10 bg-white/[0.04] px-6 py-5 text-center text-[15px] leading-7 text-slate-300">
          모든 대화는 관리자 콘솔에 그대로 남습니다. 어떤 질문에 어떤 근거로 답했는지, 어떤 질문에
          답하지 못했는지 나중에도 확인할 수 있습니다.
        </p>
      </div>
    </section>
  );
}
