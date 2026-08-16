"use client";

import { useEffect, useRef, useState } from "react";

/**
 * sticky 트랙 안에서 스크롤 비율을 활성 인덱스로 바꾼다.
 *
 * 트랙 높이가 뷰포트보다 커야 의미가 있다 (예: 280vh). 트랙 상단이
 * 뷰포트 상단을 지나간 거리 / 스크롤 가능 구간 = 진행률.
 *
 * 모바일에서는 sticky를 쓰지 않고 세로로 나열하므로 항상 전체를 활성으로
 * 둔다. 그래야 고정이 풀린 상태에서 본문이 접혀 보이지 않는다.
 */
export function usePinnedProgress<T extends HTMLElement>(stepCount: number) {
  const ref = useRef<T | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const track = ref.current;
    if (!track || stepCount <= 0) return;

    const query = window.matchMedia("(min-width: 1024px)");
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (!query.matches) {
        setPinned(false);
        return;
      }
      setPinned(true);
      const box = track.getBoundingClientRect();
      const span = box.height - window.innerHeight;
      if (span <= 0) return;
      const ratio = Math.min(Math.max(-box.top / span, 0), 1);
      setActiveIndex(Math.min(Math.floor(ratio * stepCount), stepCount - 1));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    query.addEventListener("change", measure);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      query.removeEventListener("change", measure);
    };
  }, [stepCount]);

  return { ref, activeIndex, pinned };
}
