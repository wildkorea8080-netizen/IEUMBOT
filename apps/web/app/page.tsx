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
