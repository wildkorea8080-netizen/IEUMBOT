import { SectionHeading } from "./section-heading";

/* ── 도입 절차 ─────────────────────────────────────────────── */

const STEPS = [
  {
    num: "01",
    title: "자료 등록",
    body: "홈페이지 주소를 넣고 안내 문서를 올립니다. 색인이 끝나면 어떤 자료가 검색 가능한 상태인지 목록에서 확인할 수 있습니다.",
  },
  {
    num: "02",
    title: "답변 확인",
    body: "테스트 채팅에서 실제로 들어올 법한 질문을 넣어 봅니다. 마음에 들지 않는 답변은 FAQ로 고정해 바로잡습니다.",
  },
  {
    num: "03",
    title: "설치",
    body: "관리자 화면에서 만들어진 스크립트 한 줄을 홈페이지에 붙여넣으면 끝입니다. 기존 홈페이지 디자인은 그대로 둡니다.",
  },
  {
    num: "04",
    title: "운영",
    body: "대화 로그와 지식 갭 분석을 보며 부족한 자료를 채워 나갑니다. 자료를 추가하면 즉시 답변에 반영됩니다.",
  },
];

export function StepsSection() {
  return (
    <section id="steps" className="scroll-mt-20 border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="How to start"
          title="자료 등록부터 홈페이지 설치까지"
          description="개발 부서를 거치지 않아도 담당자 선에서 진행할 수 있는 절차입니다."
        />

        <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((item) => (
            <li key={item.num} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
              <span className="text-3xl font-bold tracking-tight text-brand-600/25">{item.num}</span>
              <h3 className="mt-2 text-lg font-bold text-slate-900">{item.title}</h3>
              <p className="mt-3 text-[14px] leading-7 text-slate-600">{item.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-2 text-[12px] text-slate-400">홈페이지에 붙여넣는 설치 코드</span>
          </div>
          <pre className="overflow-x-auto px-5 py-5 text-[13px] leading-6 text-slate-300">
            <code>{`<script src="https://chat.deepsecu.co.kr/widget.js"
        data-chatbot-id="우리 기관 챗봇 ID" defer></script>`}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
