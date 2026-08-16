"use client";

import { useEffect, useRef } from "react";

/**
 * 스크롤 진입 시 자식 요소를 순차로 드러낸다.
 *
 * 컨테이너에 ref를 걸면 내부의 .landing-reveal 요소를 모두 관찰한다.
 * 진입한 요소에 data-revealed="true"를 붙이고, 같은 부모를 가진 형제끼리
 * stagger(기본 80ms)만큼 지연을 어긋나게 준다.
 *
 * 한 번 드러난 요소는 관찰을 해제한다. 스크롤을 위로 올렸을 때 다시
 * 사라지면 읽던 내용이 없어져 성가시다.
 */
export function useReveal<T extends HTMLElement>(stagger = 80) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(".landing-reveal"));
    if (targets.length === 0) return;

    // IntersectionObserver 미지원 환경에서는 즉시 전부 드러낸다.
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.setAttribute("data-revealed", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const siblings = Array.from(
            el.parentElement?.querySelectorAll<HTMLElement>(":scope > .landing-reveal") ?? [],
          );
          const index = Math.max(siblings.indexOf(el), 0);
          el.style.transitionDelay = `${index * stagger}ms`;
          el.setAttribute("data-revealed", "true");
          observer.unobserve(el);
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -40px 0px" },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [stagger]);

  return ref;
}
