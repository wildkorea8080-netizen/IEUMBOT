import type { ReactNode } from "react";
import Link from "next/link";

import { COMPANY } from "../../lib/company";
import { SectionHeading } from "./section-heading";

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

/* ── 푸터 ──────────────────────────────────────────────────── */

/**
 * 사업자 정보 항목. 확인되지 않은 값(null)은 거짓을 채우는 대신 항목 자체를 뺀다.
 * lib/company.ts에 값을 넣으면 자동으로 다시 나타난다.
 */
function companyEntries(): { label: string; value: ReactNode }[] {
  const entries: { label: string; value: ReactNode }[] = [
    { label: "상호", value: COMPANY.name },
  ];
  if (COMPANY.representative) {
    entries.push({ label: "대표자", value: COMPANY.representative });
  }
  if (COMPANY.businessNumber) {
    entries.push({ label: "사업자등록번호", value: COMPANY.businessNumber });
  }
  entries.push(
    { label: "주소", value: COMPANY.address },
    {
      label: "문의",
      value: (
        <a href={`mailto:${COMPANY.email}`} className="hover:text-white">
          {COMPANY.email}
        </a>
      ),
    },
    {
      label: "전화",
      value: (
        <a href={`tel:${COMPANY.tel}`} className="hover:text-white">
          {COMPANY.tel}
        </a>
      ),
    },
  );
  return entries;
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
            {companyEntries().map((entry) => (
              <span key={entry.label}>
                {entry.label} {entry.value}
              </span>
            ))}
          </p>
          <p className="mt-4 text-slate-500">© {new Date().getFullYear()} IEUMBOT. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
