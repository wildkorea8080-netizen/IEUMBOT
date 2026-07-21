"use client";

import { useState } from "react";

type UseCase = {
  id: string;
  tab: string;
  title: string;
  body: string;
  questions: string[];
  sources: string[];
};

const USE_CASES: UseCase[] = [
  {
    id: "local-gov",
    tab: "지자체 민원",
    title: "민원실로 오는 반복 문의를 24시간 받습니다",
    body: "증명서 발급 절차, 신청 서류, 접수 기간처럼 홈페이지에 이미 안내되어 있지만 계속 전화가 오는 질문을 챗봇이 먼저 받습니다. 근무시간이 지난 뒤 들어온 질문도 그 자리에서 안내됩니다.",
    questions: [
      "전입신고는 온라인으로도 되나요?",
      "인감증명서 대리 발급 서류가 뭔가요?",
      "주민센터 점심시간에도 접수되나요?",
    ],
    sources: ["민원 업무 편람.pdf", "홈페이지 민원 안내", "자주 묻는 질문 FAQ"],
  },
  {
    id: "facility",
    tab: "시설관리공단",
    title: "이용 안내와 예약 문의를 한 곳에서",
    body: "수영장·체육관·주차장처럼 이용 문의가 몰리는 시설의 운영 시간, 요금, 휴관일, 예약 방법을 안내합니다. 시설별로 안내가 다른 부분도 등록된 자료 그대로 답합니다.",
    questions: [
      "수영장 자유수영 시간이 어떻게 되나요?",
      "경로 할인은 몇 세부터 적용되나요?",
      "이번 주 휴관일이 언제인가요?",
    ],
    sources: ["시설 이용 안내문.hwp", "요금 규정표", "홈페이지 공지사항"],
  },
  {
    id: "education",
    tab: "교육청·학교",
    title: "학기마다 반복되는 문의를 자동으로",
    body: "입학·전학 절차, 학사 일정, 방과후 프로그램, 급식 안내처럼 시기마다 몰리는 질문에 답합니다. 자료를 새 학기 버전으로 교체하면 답변도 즉시 바뀝니다.",
    questions: [
      "전학 갈 때 필요한 서류가 뭔가요?",
      "방과후 프로그램 신청은 언제 하나요?",
      "올해 여름방학이 언제 시작되나요?",
    ],
    sources: ["학사 일정 안내.pdf", "전입학 업무 지침", "가정통신문 모음"],
  },
  {
    id: "internal",
    tab: "기관 내부 업무",
    title: "직원이 규정을 찾는 시간을 줄입니다",
    body: "복무 규정, 회계 지침, 업무 매뉴얼처럼 분량이 많고 자주 바뀌는 내부 문서를 검색합니다. 어느 규정 몇 조에서 나온 답인지 함께 보여 주기 때문에 근거를 그대로 확인할 수 있습니다.",
    questions: [
      "연가 이월은 며칠까지 가능한가요?",
      "출장비 정산 기한이 어떻게 되나요?",
      "물품 구매 시 견적서가 몇 개 필요한가요?",
    ],
    sources: ["복무 규정.hwp", "회계 처리 지침", "업무 매뉴얼 2026"],
  },
];

export function UseCaseTabs() {
  const [activeId, setActiveId] = useState(USE_CASES[0].id);
  const active = USE_CASES.find((item) => item.id === activeId) ?? USE_CASES[0];

  return (
    <section id="use-cases" className="scroll-mt-20 border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">Use cases</p>
          <h2 className="mt-3 text-[1.75rem] font-bold leading-snug tracking-tight text-slate-900 sm:text-[2.1rem]">
            이렇게 쓰고 있습니다
          </h2>
          <p className="mt-4 text-[17px] leading-8 text-slate-600">
            기관 성격에 따라 등록하는 자료와 답하는 질문이 달라집니다.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2" role="tablist">
          {USE_CASES.map((item) => {
            const isActive = item.id === active.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(item.id)}
                className={
                  isActive
                    ? "rounded-full bg-slate-900 px-5 py-2.5 text-[15px] font-semibold text-white"
                    : "rounded-full border border-slate-300 bg-white px-5 py-2.5 text-[15px] font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                }
              >
                {item.tab}
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-7 lg:grid-cols-[1fr_minmax(0,22rem)] lg:p-10">
          <div>
            <h3 className="text-xl font-bold leading-snug text-slate-900">{active.title}</h3>
            <p className="mt-4 text-[15px] leading-8 text-slate-600">{active.body}</p>

            <p className="mt-7 text-[13px] font-semibold text-slate-500">주로 등록하는 자료</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {active.sources.map((source) => (
                <span
                  key={source}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-600"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[13px] font-semibold text-slate-500">이런 질문에 답합니다</p>
            <ul className="mt-3 space-y-2.5">
              {active.questions.map((question) => (
                <li
                  key={question}
                  className="rounded-lg bg-brand-50/70 px-3.5 py-2.5 text-[14px] leading-6 text-slate-700"
                >
                  {question}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
