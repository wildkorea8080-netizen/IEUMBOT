"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * 히어로의 챗봇 데모. 실제 위젯 구조를 그대로 재현한다 —
 * 신뢰 배지, 게시판형 목록, 하단 고지까지. 목업이 실제 제품과 어긋나면
 * 도입 후 "이거랑 다른데요" 소리를 듣는다.
 *
 * 색은 packages/widget/src/bootstrap/widget-app.ts 의 .ieum-outcome-* 값을
 * 그대로 가져왔다. 위젯 색을 바꾸면 여기도 같이 바꾼다.
 */
const TURN_COUNT = 3;
const TURN_INTERVAL = 6500;

export function WidgetDemo() {
  const [visibleTurns, setVisibleTurns] = useState(TURN_COUNT);

  // HTML에는 완성된 대화가 먼저 들어간다. JS가 살아 있을 때만 되감아
  // 재생한다. 빈 화면에서 타이핑을 시작하면 스크립트가 죽는 순간
  // 히어로가 백지가 된다.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setVisibleTurns(0);

    let turn = 0;
    const timer = window.setInterval(() => {
      turn = turn >= TURN_COUNT ? 1 : turn + 1;
      setVisibleTurns(turn);
    }, TURN_INTERVAL);

    const first = window.setTimeout(() => setVisibleTurns(1), 400);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, []);

  return (
    <div className="landing-rise landing-rise-delay mx-auto w-full max-w-md lg:max-w-none">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="flex items-center gap-2.5 bg-brand-700 px-4 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-bold text-white">
            이
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">○○시청 안내 챗봇</p>
            <p className="text-[11px] text-white/60">등록된 공식 자료 기반 답변</p>
          </div>
          <span className="ml-auto text-[11px] text-white/50">데모 화면</span>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-white px-3.5 pb-1.5 pt-2.5">
          <TrustBadge>✓ 공식 등록 자료 기반 답변</TrustBadge>
          <TrustBadge>🔒 개인정보 자동 보호</TrustBadge>
        </div>

        <div
          className="space-y-3.5 overflow-hidden bg-slate-50/70 px-4 py-5"
          style={{ minHeight: "420px" }}
        >
          <Turn index={1} visible={visibleTurns}>
            <Bubble role="user">주민등록등본 발급하려면 뭐가 필요한가요?</Bubble>
            <Bubble role="bot">
              <p>
                본인이 직접 방문하시는 경우 <strong className="font-semibold">신분증</strong>만
                지참하시면 됩니다. 대리인이 방문하실 때는 위임장, 대리인 신분증, 본인 신분증 사본이
                추가로 필요합니다.
              </p>
              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <p className="mb-1.5 text-[11px] font-semibold text-slate-400">참고한 자료</p>
                <div className="flex flex-wrap gap-1.5">
                  <Source>민원실 업무 안내.pdf · 3p</Source>
                  <Source>홈페이지 &gt; 민원 안내</Source>
                </div>
              </div>
            </Bubble>
          </Turn>

          <Turn index={2} visible={visibleTurns}>
            <Bubble role="user">내년도 예산 규모가 얼마인가요?</Bubble>
            <Bubble role="bot">
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] leading-6"
                style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}
              >
                <span aria-hidden>⚠</span>
                <span>
                  등록된 자료에서 관련 근거를 찾지 못했습니다. 정확한 안내를 위해 재정과(☎
                  02-000-0000)로 문의해 주세요.
                </span>
              </div>
            </Bubble>
          </Turn>

          <Turn index={3} visible={visibleTurns}>
            <Bubble role="user">이번 달 채용 공고 알려주세요</Bubble>
            <Bubble role="bot">
              <p className="mb-2.5">현재 접수 중인 채용 공고를 안내해 드릴게요.</p>
              <ul className="space-y-2.5">
                <ListItem meta="접수 마감 2026-08-29">2026년 제3회 공무직 근로자 채용</ListItem>
                <ListItem meta="접수 마감 2026-09-05">청년인턴 하반기 모집</ListItem>
              </ul>
            </Bubble>
          </Turn>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-4 py-3">
          <div className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-[13px] text-slate-400">
            궁금한 점을 입력해 주세요
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M2.5 21 23 12 2.5 3 2.5 10l14.5 2-14.5 2z" />
            </svg>
          </span>
        </div>

        <div className="border-t border-slate-100 bg-white px-4 pb-3 pt-2 text-center">
          <p className="text-[10.5px] leading-4 text-slate-400">
            AI 이음봇도 가끔 실수할 수 있습니다. 중요한 정보는 꼭 다시 한번 확인하세요.
          </p>
          <p className="mt-1 text-[10px] text-slate-300">Powered by DeepSecu</p>
        </div>
      </div>
    </div>
  );
}

function Turn({
  index,
  visible,
  children,
}: {
  index: number;
  visible: number;
  children: ReactNode;
}) {
  const shown = visible >= index;
  return (
    <div
      className="space-y-3.5"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(10px)",
        transition:
          "opacity 420ms cubic-bezier(0.22,1,0.36,1), transform 420ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {children}
    </div>
  );
}

function TrustBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10.5px] font-medium text-slate-600">
      {children}
    </span>
  );
}

function ListItem({ children, meta }: { children: ReactNode; meta: string }) {
  return (
    <li>
      <span className="text-[13px] font-medium text-brand-700 underline decoration-brand-200 underline-offset-2">
        {children}
      </span>
      <span className="mt-0.5 block text-[11px] text-slate-400">{meta}</span>
    </li>
  );
}

function Bubble({ role, children }: { role: "user" | "bot"; children: ReactNode }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-[13px] leading-6 text-white">
          {children}
        </p>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-6 text-slate-700 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function Source({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700">
      <span aria-hidden>🔗</span>
      {children}
    </span>
  );
}
