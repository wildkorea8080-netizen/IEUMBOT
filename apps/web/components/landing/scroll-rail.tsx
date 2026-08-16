"use client";

import { useEffect, useState } from "react";

/**
 * 페이지 왼쪽 끝 3px 진행 표시. 긴 페이지에서 "얼마나 남았나"를 알려주는
 * 최소 장치다. 스크롤바보다 눈에 띄고 훨씬 조용하다.
 *
 * 장식이므로 aria-hidden. 스크린리더에는 의미가 없다.
 */
export function ScrollRail() {
  const [ratio, setRatio] = useState(0);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const span = document.body.scrollHeight - window.innerHeight;
      // 0~1로 가둔다. iOS 고무줄 스크롤에서 scrollY가 음수가 되거나 span을
      // 넘어가는데, 음수 height는 브라우저가 선언째로 버려서 레일이 직전
      // 높이에 멈춘 것처럼 보인다.
      const next = span > 0 ? window.scrollY / span : 0;
      setRatio(Math.min(Math.max(next, 0), 1));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-y-0 left-0 z-50 w-[3px] bg-slate-100"
    >
      <div
        className="w-full bg-brand-600"
        style={{ height: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}
