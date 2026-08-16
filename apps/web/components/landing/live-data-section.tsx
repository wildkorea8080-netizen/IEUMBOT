"use client";

import type { ReactNode } from "react";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

/**
 * 외부 API 실시간 연동. 랜딩에서 가장 오래 묻혀 있던 기능이다.
 * "등록한 문서만 답한다"는 기존 서사의 한계를 뚫는 자리라 별도 섹션으로 뺐다.
 */
const SAMPLES = [
  { title: "2026년 제3회 공무직 근로자 채용 공고", meta: "인사팀 · 접수 마감 2026-08-29" },
  { title: "하반기 소규모 공사 입찰 공고", meta: "회계과 · 접수 마감 2026-09-02" },
  { title: "청년 창업 지원사업 참여자 모집", meta: "일자리경제과 · 접수 마감 2026-09-10" },
];

export function LiveDataSection() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="border-b border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Live"
          title="매일 바뀌는 정보도 최신으로"
          description="문서는 한 번 올리면 그대로지만, 공고·채용·보도자료는 매일 바뀝니다. 이런 정보는 기관이 지정한 곳에서 그때그때 가져와 안내합니다."
        />

        <div
          ref={ref}
          className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-[1fr_minmax(0,24rem)]"
        >
          <div className="landing-reveal space-y-4">
            <Point title="자료를 다시 올리지 않아도 됩니다">
              공고가 새로 뜨면 챗봇 답변에도 바로 반영됩니다. 담당자가 문서를 다시 등록할 필요가
              없습니다.
            </Point>
            <Point title="기관이 지정한 곳에서만 가져옵니다">
              관리자가 등록한 주소에서만 정보를 받아옵니다. 임의로 인터넷을 뒤지지 않습니다.
            </Point>
            <Point title="목록은 바로 눌러 볼 수 있게 보여줍니다">
              제목을 누르면 원래 게시물로 이동합니다. 챗봇이 요약만 하고 끝내지 않습니다.
            </Point>
          </div>

          <div className="landing-reveal rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              답변 예시
            </p>
            <p className="mb-4 text-[13px] leading-6 text-slate-600">
              현재 접수 중인 공고를 안내해 드릴게요.
            </p>
            <ul className="space-y-3">
              {SAMPLES.map((item) => (
                <li
                  key={item.title}
                  className="border-t border-slate-100 pt-3 first:border-0 first:pt-0"
                >
                  <span className="text-[13.5px] font-medium leading-6 text-brand-700 underline decoration-brand-200 underline-offset-2">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-[11.5px] text-slate-400">{item.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-7 text-slate-600">{children}</p>
    </div>
  );
}
