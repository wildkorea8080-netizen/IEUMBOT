import type { Metadata } from "next";

import { AnswerFlowSection } from "../components/landing/answer-flow";
import { BeforeAfter } from "../components/landing/before-after";
import { ConsoleSection } from "../components/landing/console-section";
import { EvaluationSection } from "../components/landing/evaluation-section";
import { InstitutionMarquee } from "../components/landing/institution-marquee";
import { LandingCta } from "../components/landing/landing-cta";
import { LandingHero } from "../components/landing/landing-hero";
import { LandingNav } from "../components/landing/landing-nav";
import { BenefitsSection } from "../components/landing/benefits-section";
import { LandingFooter } from "../components/landing/landing-sections";
import { LiveDataSection } from "../components/landing/live-data-section";
import { ScrollRail } from "../components/landing/scroll-rail";
import { SecuritySection } from "../components/landing/security-section";
import { StepsSection } from "../components/landing/steps-section";
import { UseCaseTabs } from "../components/landing/use-case-tabs";

export const metadata: Metadata = {
  title: "IEUMBOT — 전화는 줄고, 안내는 24시간",
  description:
    "공공기관 담당자를 위한 문서 기반 AI 챗봇. 반복 문의를 24시간 받고, 등록된 자료에 근거가 없으면 지어내지 않습니다.",
};

// 이 페이지는 완전 정적으로 생성되면서 s-maxage=31536000(1년)이 붙는다.
// 그래서 새 이미지로 컨테이너가 떠도 옛 HTML이 계속 나갔고, 배포 때마다
// Coolify 에서 Restart 를 눌러야 반영됐다 — 잊으면 아무도 모른다.
// 한 시간마다 스스로 다시 만들게 한다. 랜딩은 그보다 자주 바뀌지 않는다.
export const revalidate = 3600;

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
