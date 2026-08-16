import { SectionHeading } from "./section-heading";

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
