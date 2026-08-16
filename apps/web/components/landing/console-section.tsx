import { SectionHeading } from "./section-heading";

/* ── 관리 콘솔 ─────────────────────────────────────────────── */

const CONSOLE_ITEMS = [
  { title: "대화 로그", body: "실제로 어떤 질문이 들어왔고 어떻게 답했는지 전부 확인합니다." },
  { title: "지식 갭 분석", body: "답하지 못한 질문을 모아 어떤 자료가 부족한지 알려 줍니다." },
  { title: "품질 리포트", body: "답변이 근거를 제대로 찾고 있는지 주기적으로 점검합니다." },
  { title: "검색 제어", body: "특정 문서를 검색에서 잠시 빼거나 우선순위를 조정합니다." },
  { title: "가드레일", body: "답하면 안 되는 주제를 지정해 미리 차단합니다." },
  { title: "빠른 질문", body: "자주 찾는 안내를 버튼으로 띄워 첫 화면에서 바로 연결합니다." },
];

export function ConsoleSection() {
  return (
    <section id="console" className="scroll-mt-20 border-b border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16">
        <SectionHeading
          align="left"
          eyebrow="Console"
          title="설치가 끝이 아니라 운영의 시작입니다"
          description="챗봇은 만들어 두면 낡습니다. IEUMBOT 관리자 콘솔은 무엇이 부족한지 알려 주고, 담당자가 직접 고칠 수 있게 합니다."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {CONSOLE_ITEMS.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-[15px] font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-6 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
