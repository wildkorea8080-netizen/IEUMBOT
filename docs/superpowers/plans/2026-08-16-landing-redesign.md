# 랜딩페이지 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜딩페이지를 제품 설명에서 담당자 이득 중심으로 재구성하고, 미노출 기능을 효과의 언어로 드러내며, 일관된 스크롤 모션을 넣는다.

**Architecture:** `landing-sections.tsx`(477줄, 10섹션)를 섹션별 파일로 분리하고, 모션은 CSS 토큰 + 훅 2개(`useReveal`, `usePinnedProgress`)로 통일한다. 모든 모션은 JS 게이팅(`html.js-motion`)과 `prefers-reduced-motion` 두 겹을 통과한다. 3단계로 나눠 각 단계를 독립 배포한다.

**Tech Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · IntersectionObserver · CSS custom properties

**설계 문서:** `docs/superpowers/specs/2026-08-16-landing-redesign-design.md`

---

## ⚠️ 검증 방식에 대한 전제

`apps/web`에는 **테스트 러너가 없다.** `package.json` scripts에 `lint`와 `typecheck`뿐이고 jest/vitest 설정도 테스트 파일도 없다.

이 계획은 TDD 대신 프로젝트가 실제로 가진 수단으로 검증한다.

| 수단 | 명령 | 잡아내는 것 |
|---|---|---|
| 타입 검사 | `pnpm --filter @ieumbot/web typecheck` | 시그니처·props 불일치 |
| 린트 | `pnpm --filter @ieumbot/web lint` | 훅 규칙, 미사용 변수 |
| 빌드 | `pnpm --filter @ieumbot/web build` | 서버/클라이언트 컴포넌트 경계 위반 |
| 브라우저 | preview + read_page + 콘솔 확인 | 실제 렌더·모션·접근성 폴백 |

**테스트 러너 도입은 이 계획에 포함하지 않는다.** 랜딩 재구성에 vitest + testing-library 설정을 끼워 넣는 것은 사용자가 요청하지 않은 범위이고, CI·컨벤션에 영향을 주는 별도 결정이다. 훅 두 개(`useReveal`, `usePinnedProgress`)는 단위 테스트 가치가 있으니, 러너 도입을 결정하면 그때 추가한다.

각 태스크는 브라우저 검증 단계를 포함한다. 시각·모션 작업은 타입 검사로 잡히지 않는다.

---

## 파일 구조

### 새로 만드는 파일

| 경로 | 책임 |
|---|---|
| `apps/web/components/landing/use-reveal.ts` | IntersectionObserver 진입 감지 + stagger |
| `apps/web/components/landing/use-pinned-progress.ts` | sticky 트랙 스크롤 비율 → 활성 인덱스 |
| `apps/web/components/landing/scroll-rail.tsx` | 전역 좌측 진행 레일 |
| `apps/web/components/landing/widget-demo.tsx` | 실제 위젯 재현 + 타이핑 시퀀스 |
| `apps/web/components/landing/before-after.tsx` | 섹션 3 |
| `apps/web/components/landing/benefits-section.tsx` | 섹션 4 |
| `apps/web/components/landing/answer-flow.tsx` | 섹션 5 (고정 진행) |
| `apps/web/components/landing/live-data-section.tsx` | 섹션 6 |
| `apps/web/components/landing/console-section.tsx` | 섹션 7 |
| `apps/web/components/landing/evaluation-section.tsx` | 섹션 8 |
| `apps/web/components/landing/steps-section.tsx` | 섹션 9 |
| `apps/web/components/landing/security-section.tsx` | 섹션 11 |
| `apps/web/components/landing/landing-cta.tsx` | 섹션 12 |
| `apps/web/components/landing/section-heading.tsx` | 공용 제목 (현재 private) |

### 수정하는 파일

| 경로 | 변경 |
|---|---|
| `apps/web/app/globals.css` | 모션 토큰 + reveal/pin 클래스 추가 |
| `apps/web/app/layout.tsx` | `.js-motion` 부여 스크립트 |
| `apps/web/app/page.tsx` | 섹션 12개로 조립 |
| `apps/web/components/landing/landing-hero.tsx` | 카피·CTA만 남기고 데모 분리 |
| `apps/web/components/landing/landing-sections.tsx` | 푸터만 남김 |
| `apps/web/components/landing/use-case-tabs.tsx` | 탭 전환 모션 |

### 삭제되는 것

`landing-sections.tsx`의 `ProblemSection`(→ before-after가 대체), `AnswerFlowSection`, `FeatureSection`, `ConsoleSection`, `StepsSection`, `SecuritySection`, `ClosingSection`은 각 파일로 이전된다. `LandingFooter`와 `companyEntries()`만 남는다.

---

# Phase 1 — 토대

사실과 다른 문장을 먼저 없애고, 모션 인프라와 파일 분리를 끝낸다. 이 단계만 배포해도 회귀가 없다.

## Task 1: STEP 02 문구 수정

외부 API 연동이 들어온 지금 "외부 인터넷을 뒤지지 않습니다"는 부정확하다. 가장 먼저 고친다.

**Files:**
- Modify: `apps/web/components/landing/landing-sections.tsx:88-92`

- [ ] **Step 1: FLOW_STEPS의 STEP 02 항목 교체**

`landing-sections.tsx` 88-92행을 찾는다.

```tsx
  {
    step: "STEP 02",
    title: "등록된 자료에서 근거를 찾습니다",
    body: "키워드 검색과 의미 기반 검색을 동시에 실행해 질문과 관련된 문단을 골라냅니다. 검색 대상은 기관이 등록한 자료뿐이며, 외부 인터넷을 뒤지지 않습니다.",
    tag: "기관 자료 한정",
  },
```

아래로 바꾼다.

```tsx
  {
    step: "STEP 02",
    title: "우리가 올린 자료에서만 찾습니다",
    body: "질문과 관련된 문단을 골라냅니다. 검색 대상은 기관이 등록한 자료와, 관리자가 직접 지정한 공공 API뿐입니다. 임의로 인터넷을 뒤지지 않습니다.",
    tag: "승인된 출처만",
  },
```

- [ ] **Step 2: 나머지 3단계 소제목도 담당자 언어로 교체**

같은 배열의 다른 항목 `title`만 바꾼다. `body`와 `tag`는 그대로 둔다.

| step | 새 title |
|---|---|
| STEP 01 | `"정해 둔 답이 있으면 그대로 나갑니다"` |
| STEP 03 | `"확실하지 않으면 답하지 않습니다"` |
| STEP 04 | `"어디서 나온 답인지 같이 보여줍니다"` |

- [ ] **Step 3: 타입 검사**

Run: `pnpm --filter @ieumbot/web typecheck`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/landing-sections.tsx
git commit -m "fix(landing): 외부 API 연동 후 사실과 달라진 STEP 02 문구를 바로잡는다"
```

---

## Task 2: 모션 토큰과 클래스

**Files:**
- Modify: `apps/web/app/globals.css` (기존 랜딩 블록 뒤, 231행 근처)

- [ ] **Step 1: 토큰과 reveal 클래스 추가**

`globals.css`에서 `landing-marquee-mask`의 `@media (prefers-reduced-motion: reduce)` 블록이 끝나는 지점(약 231행) 바로 뒤에 붙인다.

```css
/* ── 랜딩 모션 시스템 ────────────────────────────────
   전 섹션이 아래 토큰만 쓴다. 세련됨은 효과 개수가 아니라 값의
   일관성에서 나온다. 22px를 넘기지 않는다 — 그 이상 움직이면
   "동적"이 아니라 "산만"해진다. */
:root {
  --landing-dur-quick: 220ms;
  --landing-dur-base: 550ms;
  --landing-dur-slow: 900ms;
  --landing-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --landing-ease-soft: cubic-bezier(0.4, 0, 0.2, 1);
  --landing-rise-distance: 22px;
}

/* JS 게이팅 — 기본은 전부 보이는 상태다. JS가 로드돼야 html에
   .js-motion 이 붙고 그때부터 숨김이 시작된다. 스크립트가 죽으면
   내용은 그냥 다 보인다. opacity 로 숨겨도 안전한 이유가 이것이다. */
.landing-reveal {
  opacity: 1;
  transform: none;
}

html.js-motion .landing-reveal {
  opacity: 0;
  transform: translateY(var(--landing-rise-distance));
}

html.js-motion .landing-reveal[data-revealed="true"] {
  opacity: 1;
  transform: none;
  transition:
    opacity var(--landing-dur-base) var(--landing-ease-out),
    transform var(--landing-dur-base) var(--landing-ease-out);
}

@media (prefers-reduced-motion: reduce) {
  html.js-motion .landing-reveal,
  html.js-motion .landing-reveal[data-revealed="true"] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

- [ ] **Step 2: 빌드로 CSS 문법 확인**

Run: `pnpm --filter @ieumbot/web build`
Expected: 성공. CSS 문법 오류가 있으면 여기서 실패한다.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/app/globals.css
git commit -m "feat(landing): 모션 토큰과 JS 게이팅 reveal 클래스를 추가한다"
```

---

## Task 3: `.js-motion` 부여

**Files:**
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: layout.tsx 현재 내용 확인**

Run: `cat apps/web/app/layout.tsx`

`<html>` 태그의 위치를 확인한다.

- [ ] **Step 2: `<head>` 안에 인라인 스크립트 추가**

`<html>` 여는 태그 바로 다음에 넣는다. `beforeInteractive`가 아니라 인라인이어야 하는 이유는 첫 페인트 전에 클래스가 붙어야 깜빡임이 없기 때문이다.

```tsx
<head>
  <script
    dangerouslySetInnerHTML={{
      __html: `document.documentElement.classList.add("js-motion")`,
    }}
  />
</head>
```

기존에 `<head>`가 있으면 그 안에 `<script>`만 추가한다.

- [ ] **Step 3: 브라우저에서 클래스 확인**

Run: 개발 서버를 preview_start로 띄운 뒤

```js
document.documentElement.className
```

Expected: `js-motion` 포함

- [ ] **Step 4: 커밋**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat(landing): JS 로드 시 html에 js-motion 클래스를 부여한다"
```

---

## Task 4: `useReveal` 훅

**Files:**
- Create: `apps/web/components/landing/use-reveal.ts`

- [ ] **Step 1: 훅 작성**

```ts
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
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm --filter @ieumbot/web typecheck`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add apps/web/components/landing/use-reveal.ts
git commit -m "feat(landing): 스크롤 진입 순차 등장 훅을 추가한다"
```

---

## Task 5: `usePinnedProgress` 훅

**Files:**
- Create: `apps/web/components/landing/use-pinned-progress.ts`

- [ ] **Step 1: 훅 작성**

```ts
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
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm --filter @ieumbot/web typecheck`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add apps/web/components/landing/use-pinned-progress.ts
git commit -m "feat(landing): 고정 진행 훅을 추가한다"
```

---

## Task 6: 공용 SectionHeading 분리

지금 `landing-sections.tsx` 안의 private 함수라 새 섹션 파일에서 쓸 수 없다.

**Files:**
- Create: `apps/web/components/landing/section-heading.tsx`
- Modify: `apps/web/components/landing/landing-sections.tsx:1-28`

- [ ] **Step 1: 새 파일 생성**

`landing-sections.tsx:6-28`의 함수를 그대로 옮긴다.

```tsx
import type { ReactNode } from "react";

export function SectionHeading({
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
```

- [ ] **Step 2: 원본에서 제거하고 import로 교체**

`landing-sections.tsx`에서 `function SectionHeading(...)` 정의(6-28행)를 삭제하고 상단에 추가한다.

```tsx
import { SectionHeading } from "./section-heading";
```

- [ ] **Step 3: 타입 검사 + 빌드**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web build`
Expected: 둘 다 성공

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/section-heading.tsx apps/web/components/landing/landing-sections.tsx
git commit -m "refactor(landing): SectionHeading을 공용 파일로 분리한다"
```

---

## Task 7: 기존 섹션을 파일로 분리

`landing-sections.tsx`는 477줄에 10섹션이다. 섹션이 12개로 늘고 각각 모션이 붙으면 900줄을 넘는다.

**Files:**
- Create: `apps/web/components/landing/answer-flow.tsx`
- Create: `apps/web/components/landing/console-section.tsx`
- Create: `apps/web/components/landing/steps-section.tsx`
- Create: `apps/web/components/landing/security-section.tsx`
- Create: `apps/web/components/landing/landing-cta.tsx`
- Modify: `apps/web/components/landing/landing-sections.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 섹션별로 잘라 옮긴다**

각 파일은 해당 `export function`과 그 위의 데이터 상수(`FLOW_STEPS`, `CONSOLE_ITEMS` 등)를 함께 가져간다. 데이터는 쓰는 곳 옆에 둔다.

| 새 파일 | 옮길 것 |
|---|---|
| `answer-flow.tsx` | `FLOW_STEPS` + `AnswerFlowSection` |
| `console-section.tsx` | 콘솔 데이터 상수 + `ConsoleSection` |
| `steps-section.tsx` | 단계 데이터 상수 + `StepsSection` |
| `security-section.tsx` | 보안 데이터 상수 + `SecuritySection` |
| `landing-cta.tsx` | `ClosingSection` (이름은 `LandingCta`로) |

각 파일 상단에 필요한 import를 넣는다. 대부분 아래로 충분하다.

```tsx
import Link from "next/link";

import { SectionHeading } from "./section-heading";
```

`FeatureSection`과 `ProblemSection`은 Phase 2/3에서 교체되므로 **지금은 옮기지 않고 `landing-sections.tsx`에 둔다.**

- [ ] **Step 2: `landing-sections.tsx` 정리**

옮긴 export들을 삭제한다. 남는 것은 `ProblemSection`, `FeatureSection`, `companyEntries()`, `LandingFooter`다.

- [ ] **Step 3: `page.tsx` import 갱신**

```tsx
import type { Metadata } from "next";

import { AnswerFlowSection } from "../components/landing/answer-flow";
import { ConsoleSection } from "../components/landing/console-section";
import { InstitutionMarquee } from "../components/landing/institution-marquee";
import { LandingCta } from "../components/landing/landing-cta";
import { LandingHero } from "../components/landing/landing-hero";
import { LandingNav } from "../components/landing/landing-nav";
import { FeatureSection, LandingFooter, ProblemSection } from "../components/landing/landing-sections";
import { SecuritySection } from "../components/landing/security-section";
import { StepsSection } from "../components/landing/steps-section";
import { UseCaseTabs } from "../components/landing/use-case-tabs";
```

`<main>` 안의 `<ClosingSection />`을 `<LandingCta />`로 바꾼다. 나머지 순서는 그대로 둔다.

- [ ] **Step 4: 타입 검사 + 빌드**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint && pnpm --filter @ieumbot/web build`
Expected: 셋 다 성공

- [ ] **Step 5: 브라우저에서 회귀 확인**

preview로 랜딩을 띄우고 `get_page_text`로 섹션이 전부 남아 있는지 확인한다.

Expected: 분리 전과 같은 텍스트. 순수 이동이므로 화면이 달라지면 안 된다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/components/landing/ apps/web/app/page.tsx
git commit -m "refactor(landing): 477줄 단일 파일을 섹션별 파일로 분리한다"
```

---

## Task 8: 전역 진행 레일

**Files:**
- Create: `apps/web/components/landing/scroll-rail.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
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
      setRatio(span > 0 ? window.scrollY / span : 0);
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
```

- [ ] **Step 2: page.tsx에 추가**

```tsx
import { ScrollRail } from "../components/landing/scroll-rail";
```

`<div className="bg-white">` 바로 안, `<LandingNav />` 앞에 `<ScrollRail />`을 넣는다.

- [ ] **Step 3: 브라우저 확인**

스크롤하면서 왼쪽 파란 선이 늘어나는지 본다. 콘솔 에러가 없어야 한다.

Run: `read_console_messages` with `onlyErrors: true`
Expected: 빈 배열

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/scroll-rail.tsx apps/web/app/page.tsx
git commit -m "feat(landing): 좌측 스크롤 진행 레일을 추가한다"
```

---

## Task 9: Phase 1 통합 검증

- [ ] **Step 1: JS를 끈 상태에서 본문이 보이는지 확인**

브라우저 콘솔에서 클래스를 제거해 JS 실패 상황을 흉내낸다.

```js
document.documentElement.classList.remove("js-motion");
```

그다음 `get_page_text`로 전체 본문을 읽는다.

Expected: 모든 섹션 텍스트가 그대로 나온다. `.landing-reveal`이 아직 안 붙었더라도, 붙은 뒤에도 이 검사는 통과해야 한다.

- [ ] **Step 2: reduced-motion 확인**

```js
window.matchMedia("(prefers-reduced-motion: reduce)").matches
```

`false`면 OS 설정을 바꿔 확인하거나, CSS 규칙이 존재하는지로 갈음한다.

```js
Array.from(document.styleSheets)
  .flatMap(s => { try { return Array.from(s.cssRules) } catch { return [] } })
  .filter(r => r.conditionText?.includes("prefers-reduced-motion"))
  .length
```

Expected: 3 이상 (기존 2개 + 새로 추가한 1개)

- [ ] **Step 3: 커밋 (검증만 했으면 생략)**

---

# Phase 2 — 체감 변화가 큰 묶음

## Task 10: 위젯 재현 데모 (정적)

타이핑은 다음 태스크에서 붙인다. 먼저 완성된 대화가 HTML에 들어가 있어야 한다.

**Files:**
- Create: `apps/web/components/landing/widget-demo.tsx`
- Modify: `apps/web/components/landing/landing-hero.tsx:74-162`

- [ ] **Step 1: 실제 위젯 색 토큰 확인**

Run: `grep -n "ieum-outcome-warn\|ieum-outcome-info\|ieum-outcome-muted" packages/widget/src/bootstrap/widget-app.ts`

Expected:
```
.ieum-outcome-warn { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
.ieum-outcome-info { background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; }
.ieum-outcome-muted { background:#f8fafc; border:1px solid #e2e8f0; color:#475569; }
```

- [ ] **Step 2: 컴포넌트 작성**

```tsx
import type { ReactNode } from "react";

/**
 * 히어로의 챗봇 데모. 실제 위젯 구조를 그대로 재현한다 —
 * 신뢰 배지, 게시판형 목록, 하단 고지까지. 목업이 실제 제품과 어긋나면
 * 도입 후 "이거랑 다른데요" 소리를 듣는다.
 *
 * 색은 packages/widget/src/bootstrap/widget-app.ts 의 .ieum-outcome-* 값을
 * 그대로 가져왔다. 위젯 색을 바꾸면 여기도 같이 바꾼다.
 */
export function WidgetDemo() {
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

        <div className="space-y-3.5 bg-slate-50/70 px-4 py-5">
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

          <Bubble role="user">이번 달 채용 공고 알려주세요</Bubble>
          <Bubble role="bot">
            <p className="mb-2.5">현재 접수 중인 채용 공고를 안내해 드릴게요.</p>
            <ul className="space-y-2.5">
              <ListItem meta="접수 마감 2026-08-29">2026년 제3회 공무직 근로자 채용</ListItem>
              <ListItem meta="접수 마감 2026-09-05">청년인턴 하반기 모집</ListItem>
            </ul>
          </Bubble>
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
```

- [ ] **Step 3: 히어로에서 기존 데모 제거**

`landing-hero.tsx`에서 `ChatPreview`, `Bubble`, `Source` 함수(74-162행)를 전부 삭제하고, `<ChatPreview />`를 `<WidgetDemo />`로 바꾼다. 상단에 import를 추가한다.

```tsx
import { WidgetDemo } from "./widget-demo";
```

`import type { ReactNode } from "react";`가 더 이상 쓰이지 않으면 지운다.

- [ ] **Step 4: 타입 검사 + 린트**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`
Expected: 둘 다 성공. 미사용 import가 남아 있으면 린트가 잡는다.

- [ ] **Step 5: 브라우저에서 실제 위젯과 대조**

랜딩 히어로를 스크린샷으로 찍고, 실제 위젯 캡처와 나란히 본다.

확인 항목: 신뢰 배지 2개 · 종이비행기 아이콘 · 하단 고지 2줄 · 경고 블록 테두리(`#fde68a`) · 게시판형 목록 밑줄 링크

- [ ] **Step 6: 커밋**

```bash
git add apps/web/components/landing/widget-demo.tsx apps/web/components/landing/landing-hero.tsx
git commit -m "feat(landing): 히어로 데모를 실제 위젯 구조에 맞춘다"
```

---

## Task 11: 타이핑 시퀀스

**Files:**
- Modify: `apps/web/components/landing/widget-demo.tsx`

- [ ] **Step 1: 클라이언트 컴포넌트로 전환하고 재생 상태 추가**

파일 맨 위에 `"use client";`를 넣고, `WidgetDemo` 안에 아래를 추가한다.

```tsx
import { useEffect, useRef, useState } from "react";

const TURN_COUNT = 3;
const TURN_INTERVAL = 6500;
```

`WidgetDemo` 본문 시작에 넣는다.

```tsx
  const [visibleTurns, setVisibleTurns] = useState(TURN_COUNT);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
```

- [ ] **Step 2: 각 턴을 조건부로 감싼다**

대화 3턴을 `<Turn index={n} visible={visibleTurns}>`로 감싼다. 컴포넌트를 추가한다.

```tsx
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
        transition: "opacity 420ms cubic-bezier(0.22,1,0.36,1), transform 420ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {children}
    </div>
  );
}
```

턴 1은 사용자 질문 + 출처 답변, 턴 2는 경고 블록, 턴 3은 게시판형 목록이다.

- [ ] **Step 3: 대화 영역에 ref와 최소 높이 부여**

턴이 숨겨질 때 카드 높이가 출렁이면 히어로 전체가 흔들린다. 대화 영역에 고정 높이를 준다.

```tsx
<div
  ref={containerRef}
  className="space-y-3.5 overflow-hidden bg-slate-50/70 px-4 py-5"
  style={{ minHeight: "420px" }}
>
```

- [ ] **Step 4: 타입 검사 + 린트**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`
Expected: 성공

- [ ] **Step 5: 브라우저 확인**

히어로에서 3턴이 순환하는지 본다. 6.5초 간격.

그다음 JS 실패 상황을 확인한다 — 서버 렌더 HTML만 보려면 `view-source:` 대신 아래로 갈음한다.

Run: `curl -s http://localhost:3000 | grep -c "재정과"`
Expected: 1 이상. 완성 대화가 HTML에 들어 있어야 한다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/components/landing/widget-demo.tsx
git commit -m "feat(landing): 히어로 데모에 3턴 타이핑 루프를 넣는다"
```

---

## Task 12: 히어로 카피와 CTA 이원화

**Files:**
- Modify: `apps/web/components/landing/landing-hero.tsx:25-65`

- [ ] **Step 1: 체험 CTA 목적지 확인**

Run: `grep -n "member-signup\|SignupForm" apps/web/app/login/page.tsx`

`/login`이 `SignupForm`을 품고 있고 `/auth/member-signup`으로도 링크한다. **신규 기관 가입 진입점이 어느 쪽인지 확인한 뒤 진행한다.** 확인 전이면 `/login`을 쓴다.

- [ ] **Step 2: 헤드라인과 본문 교체**

```tsx
<h1 className="mt-5 text-[2.1rem] font-bold leading-[1.25] tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.2]">
  전화는 줄고
  <br />
  안내는 24시간
</h1>

<p className="mt-5 max-w-xl text-[17px] leading-8 text-slate-600">
  홈페이지에 이미 있는 내용을 묻는 전화, 하루에 몇 통 받으시나요? IEUMBOT이 먼저 받습니다.{" "}
  <strong className="font-semibold text-slate-900">
    등록된 자료에 근거가 없으면 지어내지 않고
  </strong>{" "}
  담당 부서를 안내하기 때문에, 틀린 안내로 문제될 일은 없습니다.
</p>
```

- [ ] **Step 3: CTA 이원화**

`답변 방식 살펴보기` 버튼을 체험으로 바꾼다.

```tsx
<div className="mt-8 flex flex-col gap-3 sm:flex-row">
  <Link
    href="/inquiry"
    className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
  >
    도입 문의하기
  </Link>
  <Link
    href="/login"
    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50"
  >
    무료로 체험하기
  </Link>
</div>
```

- [ ] **Step 4: 하단 3줄 쉬운 말로 교체**

```tsx
<ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
  <li className="flex items-center gap-1.5">
    <span className="text-brand-600">✓</span> 어디서 나온 답인지 표시
  </li>
  <li className="flex items-center gap-1.5">
    <span className="text-brand-600">✓</span> 주민번호를 적어도 자동으로 가림
  </li>
  <li className="flex items-center gap-1.5">
    <span className="text-brand-600">✓</span> 우리 자료를 AI 학습에 쓰지 않음
  </li>
</ul>
```

- [ ] **Step 5: metadata도 맞춘다**

`apps/web/app/page.tsx`의 `metadata`를 바꾼다.

```tsx
export const metadata: Metadata = {
  title: "IEUMBOT — 전화는 줄고, 안내는 24시간",
  description:
    "공공기관 담당자를 위한 문서 기반 AI 챗봇. 반복 문의를 24시간 받고, 등록된 자료에 근거가 없으면 지어내지 않습니다.",
};
```

- [ ] **Step 6: 타입 검사 + 브라우저 확인**

Run: `pnpm --filter @ieumbot/web typecheck`

브라우저에서 두 버튼이 각각 `/inquiry`와 `/login`으로 가는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/components/landing/landing-hero.tsx apps/web/app/page.tsx
git commit -m "feat(landing): 히어로를 효과 중심 카피로 바꾸고 CTA를 이원화한다"
```

---

## Task 13: Before / After 섹션

`ProblemSection`(3고민)을 대체한다.

**Files:**
- Create: `apps/web/components/landing/before-after.tsx`
- Modify: `apps/web/components/landing/landing-sections.tsx` (ProblemSection 삭제)
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

const ROWS = [
  { when: "아침", before: "어제 저녁 이후 쌓인 문의부터 처리", after: "밤사이 문의는 이미 안내 완료" },
  { when: "오전", before: "“서류 뭐 필요해요” 열 번째 설명", after: "반복 질문은 챗봇이 받음" },
  { when: "오후", before: "홈페이지에 있는 내용을 또 안내", after: "판단이 필요한 건만 담당자에게" },
  { when: "퇴근 후", before: "전화 못 받음 → 다음 날 민원", after: "안내는 계속" },
  { when: "감사 준비", before: "언제 뭐라 안내했는지 기억에 의존", after: "전 대화 기록에서 바로 확인" },
  { when: "실적 보고", before: "셀 방법이 없음", after: "응대 건수·시간대 자동 집계" },
];

export function BeforeAfter() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Before / After"
          title="담당자의 하루가 이렇게 바뀝니다"
          description="공공기관 민원 담당자가 실제로 겪는 하루를 그대로 옮겼습니다."
        />

        <div ref={ref} className="mx-auto mt-12 max-w-4xl">
          <div className="mb-3 grid grid-cols-[5.5rem_1fr_1fr] gap-3 px-1 text-xs font-bold uppercase tracking-widest">
            <span />
            <span className="text-slate-400">지금</span>
            <span className="text-brand-600">도입 후</span>
          </div>

          {ROWS.map((row) => (
            <div
              key={row.when}
              className="landing-reveal mb-2.5 grid grid-cols-[5.5rem_1fr_1fr] items-stretch gap-3"
            >
              <span className="flex items-center text-[13px] font-semibold text-slate-500">
                {row.when}
              </span>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[14px] leading-6 text-slate-500">
                {row.before}
              </p>
              <p className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3.5 text-[14px] font-medium leading-6 text-slate-800">
                {row.after}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: ProblemSection 제거**

`landing-sections.tsx`에서 `PROBLEMS` 상수와 `ProblemSection` 함수를 삭제한다.

- [ ] **Step 3: page.tsx 교체**

```tsx
import { BeforeAfter } from "../components/landing/before-after";
```

`<ProblemSection />`을 `<BeforeAfter />`로 바꾸고, `landing-sections` import에서 `ProblemSection`을 뺀다.

- [ ] **Step 4: 타입 검사 + 린트 + 브라우저**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`

브라우저에서 스크롤 진입 시 행이 순차로 나타나는지 확인한다.

- [ ] **Step 5: 모바일 폭 확인**

`resize_window` preset `mobile`로 바꾸고 3열 그리드가 깨지지 않는지 본다. 깨지면 `sm:` 분기를 추가해 세로로 쌓는다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/components/landing/before-after.tsx apps/web/components/landing/landing-sections.tsx apps/web/app/page.tsx
git commit -m "feat(landing): 3고민 나열을 담당자 하루 Before/After 대조로 바꾼다"
```

---

## Task 14: 실시간 정보 섹션

가장 큰 미노출 자산인 외부 API 연동을 드러낸다.

**Files:**
- Create: `apps/web/components/landing/live-data-section.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import type { ReactNode } from "react";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

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

        <div ref={ref} className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-[1fr_minmax(0,24rem)]">
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
                <li key={item.title} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
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
```

- [ ] **Step 2: page.tsx에 추가**

`<AnswerFlowSection />` 다음에 `<LiveDataSection />`을 넣는다.

- [ ] **Step 3: 타입 검사 + 브라우저 확인**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/live-data-section.tsx apps/web/app/page.tsx
git commit -m "feat(landing): 외부 API 실시간 연동 섹션을 신설한다"
```

---

## Task 15: 평가 자료 섹션

**Files:**
- Create: `apps/web/components/landing/evaluation-section.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 컴포넌트 작성**

카운트업은 `useReveal`이 붙인 `data-revealed`를 감지해 시작한다.

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

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
              {METRICS.map((m) => (
                <Metric key={m.label} {...m} />
              ))}
            </div>
            <p className="mt-5 text-[12px] leading-5 text-slate-400">
              도입 기관의 실제 수치가 아니라, 콘솔에서 볼 수 있는 지표의 예시입니다.
            </p>
          </div>

          <p className="mt-8 text-center text-[15px] leading-7 text-slate-600">
            기관 유형별 구체적 지표 연결은{" "}
            <Link href="/inquiry" className="font-semibold text-brand-600 underline underline-offset-2">
              문의 주시면 개별 안내
            </Link>
            드립니다.
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({ to, suffix, label }: { to: number; suffix: string; label: string }) {
  const [value, setValue] = useState(to);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setValue(0);
    let frame = 0;
    let start: number | null = null;
    const duration = 1100;

    const tick = (now: number) => {
      if (start === null) start = now;
      const p = Math.min((now - start) / duration, 1);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = window.requestAnimationFrame(tick);
    };

    // 부모 .landing-reveal 이 드러난 뒤에 센다.
    const observer = new MutationObserver(() => {
      const revealed = node.closest("[data-revealed='true']");
      if (revealed) {
        frame = window.requestAnimationFrame(tick);
        observer.disconnect();
      }
    });
    const target = node.closest(".landing-reveal");
    if (target) {
      observer.observe(target, { attributes: true, attributeFilter: ["data-revealed"] });
      if (target.getAttribute("data-revealed") === "true") {
        frame = window.requestAnimationFrame(tick);
        observer.disconnect();
      }
    } else {
      frame = window.requestAnimationFrame(tick);
    }

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
```

- [ ] **Step 2: page.tsx에 추가**

`<ConsoleSection />` 다음에 `<EvaluationSection />`을 넣는다.

- [ ] **Step 3: 타입 검사 + 린트 + 브라우저**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`

브라우저에서 섹션에 진입할 때 숫자가 올라가는지 확인한다. 예시 라벨과 캡션이 보이는지도 확인한다 — 실적으로 오해되면 안 된다.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/evaluation-section.tsx apps/web/app/page.tsx
git commit -m "feat(landing): 평가 대응 증빙 섹션을 신설한다"
```

---

# Phase 3 — 마무리

## Task 16: 효과 6가지 섹션

`FeatureSection`(3장)을 대체한다.

**Files:**
- Create: `apps/web/components/landing/benefits-section.tsx`
- Modify: `apps/web/components/landing/landing-sections.tsx` (FeatureSection 삭제)
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

const BENEFITS = [
  {
    title: "같은 질문을 다시 설명하지 않습니다",
    body: "“서류 뭐 필요해요”, “몇 시까지 해요”. 홈페이지에 이미 있는 내용은 챗봇이 먼저 받습니다.",
  },
  {
    title: "퇴근 후에도 안내가 계속됩니다",
    body: "근무시간이 끝난 뒤 들어온 문의도 그 자리에서 안내됩니다. 다음 날 아침 민원으로 쌓이지 않습니다.",
  },
  {
    title: "틀린 안내로 민원이 생기지 않습니다",
    body: "확실하지 않으면 답하지 않습니다. 근거를 못 찾으면 담당 부서 연락처를 안내합니다.",
  },
  {
    title: "자료만 올리면 준비가 끝납니다",
    body: "PDF·한글·워드·엑셀과 홈페이지 주소를 그대로 등록하면 됩니다. 스캔한 문서도 읽습니다.",
  },
  {
    title: "개인정보는 자동으로 걸러집니다",
    body: "이용자가 주민번호나 연락처를 적어도 자동으로 가립니다. 걸러낸 기록도 남습니다.",
  },
  {
    title: "무엇이 부족한지 알려줍니다",
    body: "답하지 못한 질문을 모아 보여줍니다. 어떤 자료를 더 올려야 하는지 알 수 있습니다.",
  },
];

export function BenefitsSection() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section id="features" className="scroll-mt-20 border-b border-slate-200 bg-white py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading eyebrow="Benefits" title="이렇게 좋아집니다" />
        <div ref={ref} className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((item) => (
            <div
              key={item.title}
              className="landing-reveal rounded-2xl border border-slate-200 bg-slate-50/60 p-6 transition-colors hover:border-brand-300"
            >
              <h3 className="text-[16px] font-bold leading-snug text-slate-900">{item.title}</h3>
              <p className="mt-2.5 text-[14px] leading-7 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: FeatureSection 제거 + page.tsx 교체**

`landing-sections.tsx`에서 `FEATURES` 상수와 `FeatureSection`을 삭제한다. `page.tsx`에서 `<FeatureSection />`을 `<BenefitsSection />`으로 바꾼다.

이 시점에 `landing-sections.tsx`에는 `companyEntries()`와 `LandingFooter`만 남는다. 파일명을 유지하되 상단 주석으로 역할을 밝힌다.

```tsx
/* 랜딩 푸터. 섹션들은 각자 파일로 분리되어 있다. */
```

- [ ] **Step 3: 타입 검사 + 린트 + 빌드**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint && pnpm --filter @ieumbot/web build`

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/ apps/web/app/page.tsx
git commit -m "feat(landing): 기능 3장을 효과 6가지로 바꾼다"
```

---

## Task 17: 답변 흐름 고정 진행

**Files:**
- Modify: `apps/web/components/landing/answer-flow.tsx`

- [ ] **Step 1: 클라이언트 컴포넌트로 전환**

파일 맨 위에 `"use client";`를 넣고 훅을 import 한다.

```tsx
import { usePinnedProgress } from "./use-pinned-progress";
```

- [ ] **Step 2: 섹션 제목 교체**

```tsx
<h2 className="mt-3 text-[1.75rem] font-bold leading-snug tracking-tight text-white sm:text-[2.1rem]">
  그런데 AI가 틀리면요?
</h2>
<p className="mt-4 text-[17px] leading-8 text-slate-300">
  가장 많이 걱정하시는 부분입니다. IEUMBOT은 질문 하나에 아래 네 단계를 그대로 거칩니다.
</p>
```

eyebrow는 `Answer Flow` 그대로 둔다.

- [ ] **Step 3: 트랙과 sticky 패널로 감싼다**

기존 `<ol>` 그리드를 아래 구조로 바꾼다.

```tsx
const { ref, activeIndex, pinned } = usePinnedProgress<HTMLDivElement>(FLOW_STEPS.length);

// ...

<div ref={ref} className="mt-12 lg:h-[280vh]">
  <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center">
    <ol className="w-full space-y-3">
      {FLOW_STEPS.map((item, index) => {
        const on = !pinned || index === activeIndex;
        return (
          <li
            key={item.step}
            className={`rounded-2xl border p-6 transition-all duration-[550ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
              on
                ? "border-brand-400 bg-white/[0.10] lg:translate-x-2"
                : "border-white/10 bg-white/[0.04]"
            }`}
          >
            <p className={`text-xs font-bold tracking-widest ${on ? "text-brand-200" : "text-slate-500"}`}>
              {item.step}
            </p>
            <h3 className={`mt-3 text-[17px] font-bold leading-snug ${on ? "text-white" : "text-slate-400"}`}>
              {item.title}
            </h3>
            <p
              className="overflow-hidden text-[14px] leading-7 text-slate-300 transition-all duration-[550ms]"
              style={{
                maxHeight: on ? "8rem" : "0rem",
                opacity: on ? 1 : 0,
                marginTop: on ? "0.75rem" : "0rem",
              }}
            >
              {item.body}
            </p>
            {on ? (
              <span className="mt-4 inline-block rounded-md bg-brand-500/20 px-2.5 py-1 text-[12px] font-semibold text-brand-100">
                {item.tag}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  </div>
</div>
```

`pinned`가 `false`(모바일)면 `on`이 항상 `true`라 전체가 펼쳐진다.

- [ ] **Step 4: 타입 검사 + 린트**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`

- [ ] **Step 5: 데스크톱·모바일 양쪽 확인**

데스크톱: 스크롤하면 4단계가 순서대로 활성화되는지
모바일(`resize_window` preset `mobile`): 고정이 풀리고 4개가 전부 펼쳐진 채 세로로 쌓이는지

- [ ] **Step 6: 커밋**

```bash
git add apps/web/components/landing/answer-flow.tsx
git commit -m "feat(landing): 답변 흐름을 스크롤 고정 진행으로 바꾼다"
```

---

## Task 18: 관리 콘솔 12개

**Files:**
- Modify: `apps/web/components/landing/console-section.tsx`

- [ ] **Step 1: 데이터를 4묶음 12항목으로 교체**

```tsx
const CONSOLE_GROUPS = [
  {
    group: "운영",
    items: [
      { title: "대화 로그", body: "어떤 질문에 어떻게 답했는지 전부 확인합니다." },
      { title: "답 못한 질문", body: "안내하지 못한 질문을 모아 보여줍니다." },
      { title: "빠른 질문", body: "자주 찾는 안내를 첫 화면 버튼으로 띄웁니다." },
    ],
  },
  {
    group: "품질",
    items: [
      { title: "답변 품질 점검", body: "잘 답하고 있는지 주기적으로 알려줍니다." },
      { title: "부족한 자료 찾기", body: "어떤 자료를 더 올려야 하는지 알려줍니다." },
      { title: "자료 검토", body: "올린 자료를 색인 전에 사람이 확인합니다." },
    ],
  },
  {
    group: "보안",
    items: [
      { title: "개인정보 차단 기록", body: "주민번호 같은 입력을 가린 이력이 남습니다." },
      { title: "변경 이력", body: "누가 언제 무엇을 바꿨는지 남습니다." },
      { title: "팀 권한", body: "기관 관리자와 담당자 권한을 나눕니다." },
    ],
  },
  {
    group: "분석",
    items: [
      { title: "주제별 통계", body: "어떤 주제 문의가 많은지 보여줍니다." },
      { title: "시간대 분석", body: "언제 문의가 몰리는지 보여줍니다." },
      { title: "이용 현황", body: "응대 건수와 추이를 한눈에 봅니다." },
    ],
  },
];
```

- [ ] **Step 2: 렌더를 묶음 구조로 바꾸고 reveal + 호버 적용**

```tsx
"use client";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

export function ConsoleSection() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section id="console" className="scroll-mt-20 border-b border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Console"
          title="혼자서도 운영됩니다"
          description="챗봇은 만들어 두면 낡습니다. 무엇이 부족한지 알려 주고, 담당자가 직접 고칠 수 있게 했습니다."
        />

        <div ref={ref} className="mt-12 space-y-8">
          {CONSOLE_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-600">
                {group.group}
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {group.items.map((item) => (
                  <div
                    key={item.title}
                    className="landing-reveal rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all duration-[220ms] hover:-translate-y-[3px] hover:border-brand-400"
                  >
                    <h3 className="text-[15px] font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-6 text-slate-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 타입 검사 + 브라우저 확인**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`

호버 시 3px 떠오르는지, 진입 시 묶음별로 stagger가 걸리는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/console-section.tsx
git commit -m "feat(landing): 관리 콘솔 소개를 6개에서 12개 4묶음으로 넓힌다"
```

---

## Task 19: 보안 6항목 질문형

**Files:**
- Modify: `apps/web/components/landing/security-section.tsx`

- [ ] **Step 1: 데이터를 질문형 6항목으로 교체**

```tsx
const SECURITY_QA = [
  {
    q: "우리 자료가 AI 학습에 쓰이나요?",
    a: "쓰이지 않습니다. 답변 생성에 사용하는 외부 AI 사업자와의 계약상 전송된 자료를 모델 학습에 사용하지 않습니다.",
  },
  {
    q: "다른 기관 자료가 섞이지 않나요?",
    a: "기관 단위로 데이터를 나누어 처리합니다. 다른 기관의 자료가 검색되거나 답변에 섞이지 않습니다.",
  },
  {
    q: "누가 관리자로 들어올 수 있나요?",
    a: "관리자 권한을 기관 관리자와 담당자로 나눕니다. 접속 기록이 남고 전송 구간은 모두 암호화합니다.",
  },
  {
    q: "자료를 외부에 보내기 어려운데요?",
    a: "민감도가 높아 외부 전송이 어려운 경우 별도 협의를 통해 구성 방식을 조정할 수 있습니다.",
  },
  {
    q: "이용자가 주민번호를 적으면요?",
    a: "자동으로 가려서 처리하고, 가린 이력이 관리자 화면에 기록으로 남습니다. 개인 신상이 걸린 질문은 답을 만들지 않고 담당 부서로 안내합니다.",
  },
  {
    q: "누가 설정을 바꿨는지 알 수 있나요?",
    a: "관리자가 무엇을 언제 바꿨는지 이력이 남습니다. 감사 대응 시 그대로 확인할 수 있습니다.",
  },
];
```

- [ ] **Step 2: 렌더 교체**

자물쇠 이모지는 제거한다 — 질문형 제목이면 아이콘 없이도 읽힌다. 파일 전체를 아래로 바꾼다 (`SECURITY_QA`는 Step 1의 것을 그대로 둔다).

```tsx
"use client";

import { SectionHeading } from "./section-heading";
import { useReveal } from "./use-reveal";

export function SecuritySection() {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="border-b border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <SectionHeading
          eyebrow="Security"
          title="도입 전에 확인하시는 것들"
          description="검토 단계에서 가장 많이 받는 질문을 정리했습니다."
        />

        <div ref={ref} className="mt-12 grid gap-4 md:grid-cols-2">
          {SECURITY_QA.map((item) => (
            <div
              key={item.q}
              className="landing-reveal rounded-2xl border border-slate-200 bg-white p-6"
            >
              <h3 className="text-[16px] font-bold leading-snug text-slate-900">{item.q}</h3>
              <p className="mt-2 text-[14px] leading-7 text-slate-600">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 타입 검사 + 브라우저**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/security-section.tsx
git commit -m "feat(landing): 보안 항목을 담당자가 실제로 묻는 질문형 6개로 바꾼다"
```

---

## Task 20: 시작 4단계에 체험 연결

설계 문서 §4.9. 절차를 다 읽은 사람이 바로 시작할 수 있어야 한다.

**Files:**
- Modify: `apps/web/components/landing/steps-section.tsx`

- [ ] **Step 1: reveal 적용**

파일 맨 위에 `"use client";`를 넣고 훅을 건다.

```tsx
import { useReveal } from "./use-reveal";
```

컴포넌트 본문에 `const ref = useReveal<HTMLDivElement>();`를 추가하고, 4단계를 감싸는 그리드 컨테이너에 `ref={ref}`를, 각 단계 카드에 `landing-reveal` 클래스를 붙인다.

- [ ] **Step 2: 설치 코드 블록 아래에 체험 CTA 추가**

`<script src=...>` 설치 코드 블록을 감싸는 요소 다음에 넣는다.

```tsx
<div className="mt-8 text-center">
  <p className="text-[15px] leading-7 text-slate-600">
    직접 해보시는 게 가장 빠릅니다. 가입하고 우리 기관 자료를 올려 보세요.
  </p>
  <Link
    href="/login"
    className="mt-4 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
  >
    무료로 체험하기
  </Link>
</div>
```

`Link`가 import되어 있지 않으면 상단에 추가한다.

```tsx
import Link from "next/link";
```

- [ ] **Step 3: 타입 검사 + 린트**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint`
Expected: 성공

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/landing/steps-section.tsx
git commit -m "feat(landing): 도입 절차 끝에 체험 CTA를 연결한다"
```

---

## Task 21: 최종 CTA 이원화

**Files:**
- Modify: `apps/web/components/landing/landing-cta.tsx`

- [ ] **Step 1: 버튼 두 개로 교체**

기존 `도입 문의하기` + `관리자 로그인` 쌍을 바꾼다.

```tsx
<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
  <Link
    href="/inquiry"
    className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
  >
    도입 문의하기
  </Link>
  <Link
    href="/login"
    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50"
  >
    무료로 체험하기
  </Link>
</div>
```

- [ ] **Step 2: 문구를 효과 중심으로**

```tsx
title="우리 기관 자료로 먼저 확인해 보세요"
description="담당자 연락처를 남겨 주시면 기관 자료를 함께 살펴보고, 어떤 질문에 어디까지 답할 수 있는지 직접 보여 드립니다."
```

기존과 같으면 그대로 둔다.

- [ ] **Step 3: 네비게이션에도 체험 링크 추가**

`apps/web/components/landing/landing-nav.tsx`의 `/login` 링크 라벨을 `로그인`에서 그대로 두되, 모바일 메뉴에도 노출되는지 확인한다.

- [ ] **Step 4: 타입 검사 + 커밋**

```bash
git add apps/web/components/landing/landing-cta.tsx apps/web/components/landing/landing-nav.tsx
git commit -m "feat(landing): 최종 CTA를 문의와 체험으로 이원화한다"
```

---

## Task 22: 활용 분야 탭 전환 모션

**Files:**
- Modify: `apps/web/components/landing/use-case-tabs.tsx`

- [ ] **Step 1: 패널에 전환 스타일 추가**

상태 변수는 `use-case-tabs.tsx:66-67`의 `activeId`(선택된 id)와 `active`(찾아낸 객체)다.

활성 패널을 감싸는 요소에 `key={activeId}`를 주어 탭이 바뀔 때 다시 마운트되게 하고, 전용 클래스를 건다. 패널은 106행 `<h3>{active.title}</h3>`를 포함하는 컨테이너다.

```tsx
<div key={activeId} className="landing-tab-panel">
  {/* 기존 패널 내용 그대로 */}
</div>
```

- [ ] **Step 2: 전용 클래스 정의**

`globals.css`의 랜딩 모션 블록 끝에 추가한다. Tailwind 임의값 클래스(`animate-[...]`)는 `@media` 안에서 이스케이프가 번거로우므로 전용 클래스를 쓴다.

```css
.landing-tab-panel {
  animation: landingRise 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .landing-tab-panel {
    animation: none;
  }
}
```

- [ ] **Step 3: 타입 검사 + 브라우저 + 커밋**

```bash
git add apps/web/components/landing/use-case-tabs.tsx apps/web/app/globals.css
git commit -m "feat(landing): 활용 분야 탭 전환에 진입 모션을 넣는다"
```

---

## Task 23: 전체 조립과 최종 검증

**Files:**
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 최종 섹션 순서 확인**

```tsx
export default function HomePage() {
  return (
    <div className="bg-white">
      <ScrollRail />
      <LandingNav />
      <main>
        <LandingHero />
        <InstitutionMarquee />
        <BeforeAfter />
        <BenefitsSection />
        <AnswerFlowSection />
        <LiveDataSection />
        <ConsoleSection />
        <EvaluationSection />
        <StepsSection />
        <UseCaseTabs />
        <SecuritySection />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
```

12개 섹션이 설계 문서 순서와 일치하는지 대조한다.

- [ ] **Step 2: 네비게이션 앵커 갱신**

`landing-nav.tsx`의 `NAV_ITEMS`에서 삭제된 섹션 id를 가리키는 항목이 없는지 확인한다. 현재 `#answer-flow`, `#features`, `#console`, `#steps`, `#use-cases`를 쓴다. `#features`는 `BenefitsSection`으로 옮겼으므로 id가 유지되었는지 확인한다.

Run: `grep -n 'id="' apps/web/components/landing/*.tsx`

- [ ] **Step 3: 금지 용어 검사**

Run:
```bash
grep -rniE "RAG|임베딩|색인|청킹|가드레일|에스컬레이션|마스킹|출처 표시 방식" apps/web/components/landing/ apps/web/app/page.tsx
```

Expected: 결과 없음. 나오면 §3 용어 전환 규칙에 따라 바꾼다.

- [ ] **Step 4: 전체 빌드**

Run: `pnpm --filter @ieumbot/web typecheck && pnpm --filter @ieumbot/web lint && pnpm --filter @ieumbot/web build`
Expected: 셋 다 성공

- [ ] **Step 5: JS 없이 본문이 보이는지 확인**

브라우저 콘솔에서

```js
document.documentElement.classList.remove("js-motion");
document.querySelectorAll(".landing-reveal").forEach(el => el.removeAttribute("data-revealed"));
```

그다음 `get_page_text`로 전체를 읽는다.

Expected: 12개 섹션 본문이 전부 보인다. 하나라도 안 보이면 그 섹션이 게이팅을 어긴 것이다.

- [ ] **Step 6: reduced-motion 확인**

```js
Array.from(document.styleSheets)
  .flatMap(s => { try { return Array.from(s.cssRules) } catch { return [] } })
  .filter(r => r.conditionText?.includes("prefers-reduced-motion")).length
```

Expected: 4 이상

- [ ] **Step 7: 모바일 확인**

`resize_window` preset `mobile` 후 새로고침. 고정 진행 섹션이 세로 나열로 폴백되고 가로 스크롤이 없는지 확인한다.

```js
document.body.scrollWidth <= window.innerWidth
```

Expected: `true`

- [ ] **Step 8: 콘솔 에러 확인**

Run: `read_console_messages` with `onlyErrors: true`
Expected: 빈 배열

- [ ] **Step 9: 커밋**

```bash
git add apps/web/app/page.tsx apps/web/components/landing/landing-nav.tsx
git commit -m "feat(landing): 12개 섹션으로 재구성을 마무리한다"
```

---

## 완료 기준

- [ ] `typecheck` · `lint` · `build` 전부 통과
- [ ] JS를 끈 상태에서 12개 섹션 본문이 모두 보인다
- [ ] `prefers-reduced-motion` 에서 전환이 모두 꺼진다
- [ ] 모바일에서 고정 진행이 세로 나열로 폴백되고 가로 스크롤이 없다
- [ ] 랜딩 전문에 금지 용어가 없다
- [ ] STEP 02 문구가 수정되었다
- [ ] 평가 지표 밴드에 예시임을 밝히는 라벨과 캡션이 있다
- [ ] 히어로 데모에 신뢰 배지 · 하단 고지 · 게시판형 목록이 있다
