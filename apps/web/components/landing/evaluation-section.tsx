"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

/**
 * 평가 대응 증빙. 담당자가 상급자에게 예산을 설득할 때 쓰는 자리다.
 *
 * 점수나 등급이 오른다고 말하지 않는다. 평가 체계는 기관 유형마다 다르고
 * (기재부·행안부·지자체 합동평가·교육청) 담당자는 편람을 우리보다 잘 안다.
 * 검증 못 할 숫자를 박으면 그 자리에서 신뢰를 잃는다. 대신 "증빙이 자동으로
 * 쌓인다"고만 말한다 — 이건 사실이고 확인 가능하다.
 */
const EVIDENCE = [
  { need: "대국민(주민) 서비스 개선", gives: "응대 건수 · 시간대별 · 주제별" },
  { need: "비대면·디지털 서비스 확대", gives: "24시간 안내 건수, 야간·주말 비중" },
  { need: "개인정보 보호 조치 이행", gives: "개인정보 입력 차단 기록" },
  { need: "업무 효율화", gives: "반복 문의 처리 건수" },
  { need: "서비스 품질 관리", gives: "답변 품질 점검 리포트" },
  { need: "개선 계획 수립", gives: "답 못한 질문 목록" },
];

const METRICS = [
  { to: 1284, suffix: "", label: "월 응대 건수" },
  { to: 37, suffix: "%", label: "야간·주말 문의 비중" },
  { to: 92, suffix: "%", label: "근거 포함 답변률" },
  { to: 6, suffix: "초", label: "평균 응답 시간" },
];

export function EvaluationSection() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Report"
          title="평가 때 쓸 자료가 자동으로 쌓입니다"
          description="평가 준비 기간에 자료를 소급해서 만드느라 고생하지 않도록, 쓰는 동안 증빙이 남습니다."
        />

        <div ref={ref} className="mx-auto mt-12 max-w-4xl">
          <div className="landing-reveal overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-2 bg-slate-50 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              <span className="px-5 py-3">평가에서 요구하는 것</span>
              <span className="border-l border-slate-200 px-5 py-3">자동으로 나오는 자료</span>
            </div>
            {EVIDENCE.map((row) => (
              <div key={row.need} className="grid grid-cols-2 border-t border-slate-100 text-[14px]">
                <span className="px-5 py-3.5 text-slate-600">{row.need}</span>
                <span className="border-l border-slate-100 px-5 py-3.5 font-medium text-slate-900">
                  {row.gives}
                </span>
              </div>
            ))}
          </div>

          <div className="landing-reveal mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              관리자 콘솔 예시 화면
            </p>
            <div className="grid gap-5 sm:grid-cols-4">
              {METRICS.map((metric) => (
                <Metric key={metric.label} {...metric} />
              ))}
            </div>
            <p className="mt-5 text-[12px] leading-5 text-slate-400">
              도입 기관의 실제 수치가 아니라, 콘솔에서 볼 수 있는 지표의 예시입니다.
            </p>
          </div>

          <p className="mt-8 text-center text-[15px] leading-7 text-slate-600">
            기관 유형별 구체적 지표 연결은{" "}
            <Link
              href="/inquiry"
              className="font-semibold text-brand-600 underline underline-offset-2"
            >
              문의 주시면 개별 안내
            </Link>
            드립니다.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * 화면에 들어올 때 숫자를 센다. 자기 IntersectionObserver를 쓴다 —
 * 부모의 reveal 상태를 훔쳐보게 만들면 두 훅이 얽혀서 나중에 못 고친다.
 */
function Metric({ to, suffix, label }: { to: number; suffix: string; label: string }) {
  const [value, setValue] = useState(to);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    setValue(0);
    let frame = 0;
    let start: number | null = null;
    const duration = 1100;

    const tick = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        frame = window.requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [to]);

  return (
    <div ref={nodeRef}>
      <p className="text-[1.9rem] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
        {value.toLocaleString()}
        {suffix}
      </p>
      <p className="mt-1.5 text-[12.5px] text-slate-500">{label}</p>
    </div>
  );
}
