import type { ReactNode } from "react";
import Link from "next/link";

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-sm font-bold uppercase tracking-widest text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-[1.75rem] font-bold leading-snug tracking-tight text-slate-900 sm:text-[2.1rem]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-[17px] leading-8 text-slate-600">{description}</p>
      ) : null}
    </div>
  );
}

/* ── 문제 제기 ─────────────────────────────────────────────── */

const PROBLEMS = [
  {
    icon: "📞",
    title: "같은 질문이 하루 종일 반복됩니다",
    body: "“주차 되나요”, “서류 뭐 필요해요”, “몇 시까지 해요”. 홈페이지에 이미 다 있는 내용인데도 전화는 멈추지 않습니다. 근무시간이 끝난 뒤 들어온 문의는 다음 날 아침 민원으로 쌓입니다.",
  },
  {
    icon: "⚠️",
    title: "AI가 없는 내용을 지어낼까 두렵습니다",
    body: "일반 생성형 AI는 그럴듯하게 틀린 답을 만들어 냅니다. 잘못된 안내 한 줄이 민원과 감사 지적으로 돌아올 수 있다는 부담에 도입 자체를 미루게 됩니다.",
  },
  {
    icon: "🧑‍💻",
    title: "전담 인력도 큰 예산도 없습니다",
    body: "정보화 담당은 순환보직으로 바뀌고, 대형 구축 사업은 예산과 유지보수가 부담입니다. 그렇다고 아무도 쓰지 않는 버튼형 챗봇을 또 만들 수는 없습니다.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Why"
          title="“챗봇, 하고는 싶은데 겁부터 나시죠”"
          description="공공기관 담당자라면 한 번쯤 겪는 세 가지입니다."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PROBLEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 transition-colors hover:border-slate-300"
            >
              <span className="text-2xl" aria-hidden>
                {item.icon}
              </span>
              <h3 className="mt-4 text-lg font-bold leading-snug text-slate-900">{item.title}</h3>
              <p className="mt-3 text-[15px] leading-7 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 답변 생성 4단계 (핵심 신뢰 서사) ───────────────────────── */

const FLOW_STEPS = [
  {
    step: "STEP 01",
    title: "확정 답변을 먼저 확인합니다",
    body: "관리자가 FAQ로 지정해 둔 질문은 AI가 새로 문장을 만들지 않고 지정된 답변을 그대로 내보냅니다. 민감하거나 자주 바뀌는 안내는 이렇게 100% 통제할 수 있습니다.",
    tag: "관리자 통제",
  },
  {
    step: "STEP 02",
    title: "등록된 자료에서 근거를 찾습니다",
    body: "키워드 검색과 의미 기반 검색을 동시에 실행해 질문과 관련된 문단을 골라냅니다. 검색 대상은 기관이 등록한 자료뿐이며, 외부 인터넷을 뒤지지 않습니다.",
    tag: "기관 자료 한정",
  },
  {
    step: "STEP 03",
    title: "근거가 충분할 때만 답을 만듭니다",
    body: "찾아낸 근거의 관련도 점수가 기준에 미치지 못하면 답변을 생성하지 않습니다. 억지로 문장을 만들어 내는 대신, 모른다고 말하도록 설계했습니다.",
    tag: "환각 차단",
  },
  {
    step: "STEP 04",
    title: "출처와 함께 답을 제시합니다",
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

/* ── 핵심 기능 ─────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: "📄",
    title: "자료만 올리면 준비 끝",
    body: "PDF·한글·워드·엑셀 문서와 홈페이지 주소를 그대로 등록하면 IEUMBOT이 읽어서 색인합니다. 스캔 문서는 문자 인식으로 처리하고, 홈페이지는 주기적으로 다시 확인해 바뀐 내용을 반영합니다.",
    points: ["PDF·HWP·DOCX·XLSX 지원", "홈페이지 자동 수집·동기화", "스캔 문서 문자 인식"],
  },
  {
    icon: "🔍",
    title: "감사 앞에서 설명 가능한 답변",
    body: "모든 답변에 근거 문서를 함께 표시하고, 주고받은 대화를 전부 보관합니다. 어떤 질문에 어떤 자료를 근거로 답했는지 나중에 그대로 확인할 수 있습니다.",
    points: ["답변별 출처 링크", "대화 로그 전량 보관", "근거 부족 시 답변 보류"],
  },
  {
    icon: "🔒",
    title: "개인정보는 자동으로 차단",
    body: "이용자가 주민등록번호나 연락처 같은 정보를 입력하면 자동으로 가려서 처리합니다. 개인 신상이 걸린 질문은 답을 만들지 않고 담당 부서로 안내합니다.",
    points: ["입력 개인정보 자동 마스킹", "민감 질문 담당 부서 연결", "기관별 데이터 분리 보관"],
  },
];

export function FeatureSection() {
  return (
    <section id="features" className="scroll-mt-20 border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Features"
          title="담당자가 직접 운영할 수 있게 만들었습니다"
          description="개발 지식 없이, 전담 인력 없이도 등록부터 운영까지 관리자 화면에서 처리됩니다."
        />

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {FEATURES.map((item) => (
            <div
              key={item.title}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-xl"
                aria-hidden
              >
                {item.icon}
              </span>
              <h3 className="mt-5 text-lg font-bold leading-snug text-slate-900">{item.title}</h3>
              <p className="mt-3 flex-1 text-[15px] leading-7 text-slate-600">{item.body}</p>
              <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                {item.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-[14px] text-slate-600">
                    <span className="mt-0.5 font-bold text-brand-600" aria-hidden>
                      ✓
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

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

/* ── 보안 ──────────────────────────────────────────────────── */

const SECURITY = [
  {
    title: "등록 자료는 AI 학습에 쓰이지 않습니다",
    body: "답변 생성에 사용하는 외부 AI 사업자와의 계약상 전송된 자료를 모델 학습에 사용하지 않습니다.",
  },
  {
    title: "기관별로 데이터를 분리합니다",
    body: "다른 기관의 자료가 검색되거나 답변에 섞이지 않도록 기관 단위로 데이터를 나누어 처리합니다.",
  },
  {
    title: "접근 권한을 최소화합니다",
    body: "관리자 권한을 기관 관리자와 담당자로 나누고, 접속 기록을 남깁니다. 전송 구간은 모두 암호화합니다.",
  },
  {
    title: "전용 인프라 구축도 가능합니다",
    body: "자료의 민감도가 높아 외부 전송이 어려운 경우 별도 협의를 통해 구성 방식을 조정할 수 있습니다.",
  },
];

export function SecuritySection() {
  return (
    <section className="border-b border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Security"
          title="공공기관이 먼저 묻는 것에 답합니다"
          description="도입 검토 단계에서 가장 많이 확인하시는 항목을 미리 정리했습니다."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {SECURITY.map((item) => (
            <div
              key={item.title}
              className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm text-white">
                🔐
              </span>
              <div>
                <h3 className="text-[16px] font-bold leading-snug text-slate-900">{item.title}</h3>
                <p className="mt-2 text-[14px] leading-7 text-slate-600">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 마무리 CTA ────────────────────────────────────────────── */

export function ClosingSection() {
  return (
    <section className="bg-brand-600 py-20">
      <div className="mx-auto w-full max-w-3xl px-5 text-center">
        <h2 className="text-[1.75rem] font-bold leading-snug tracking-tight text-white sm:text-[2.1rem]">
          우리 기관 자료로 먼저 확인해 보세요
        </h2>
        <p className="mt-4 text-[17px] leading-8 text-brand-50">
          담당자 연락처를 남겨 주시면 기관 자료를 함께 살펴보고, 어떤 질문에 어디까지 답할 수 있는지
          직접 보여 드립니다.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/inquiry"
            className="inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
          >
            도입 문의하기
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl border border-white/40 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            관리자 로그인
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── 푸터 ──────────────────────────────────────────────────── */

/** 확정 전 사업자 정보 자리표시. 오픈 전 실제 값으로 교체할 것. */
function Blank({ label }: { label: string }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[12px] font-medium text-amber-900">
      [{label}]
    </span>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-slate-900 py-12">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                이
              </span>
              <span className="text-base font-bold text-white">IEUMBOT</span>
            </div>
            <p className="mt-3 text-[13px] leading-6 text-slate-400">
              공공기관 자료 기반 AI 챗봇 · 근거 없이는 답하지 않습니다
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-300">
            <Link href="/terms" className="hover:text-white">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-white">
              개인정보처리방침
            </Link>
            <Link href="/inquiry" className="hover:text-white">
              도입 문의
            </Link>
            <Link href="/login" className="hover:text-white">
              관리자 로그인
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-[12px] leading-6 text-slate-400">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span>
              상호 <Blank label="회사명" />
            </span>
            <span>
              대표자 <Blank label="대표자명" />
            </span>
            <span>
              사업자등록번호 <Blank label="000-00-00000" />
            </span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span>
              주소 <Blank label="사업장 주소" />
            </span>
            <span>
              문의 <Blank label="support@example.com" />
            </span>
          </p>
          <p className="mt-4 text-slate-500">© {new Date().getFullYear()} IEUMBOT. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
