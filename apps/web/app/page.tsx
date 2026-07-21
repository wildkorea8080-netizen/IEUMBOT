import type { Metadata } from "next";

import { LandingHero } from "../components/landing/landing-hero";
import { LandingNav } from "../components/landing/landing-nav";
import {
  AnswerFlowSection,
  ClosingSection,
  ConsoleSection,
  FeatureSection,
  LandingFooter,
  ProblemSection,
  SecuritySection,
  StepsSection,
} from "../components/landing/landing-sections";
import { UseCaseTabs } from "../components/landing/use-case-tabs";

export const metadata: Metadata = {
  title: "IEUMBOT — 근거 없이는 답하지 않는 공공기관 AI 챗봇",
  description:
    "기관이 등록한 자료 안에서만 답하고, 모든 답변에 출처를 표시하는 공공기관 전용 문서 기반 AI 챗봇입니다.",
};

export default function HomePage() {
  return (
    <div className="bg-white">
      <LandingNav />
      <main>
        <LandingHero />
        <ProblemSection />
        <AnswerFlowSection />
        <FeatureSection />
        <ConsoleSection />
        <StepsSection />
        <UseCaseTabs />
        <SecuritySection />
        <ClosingSection />
      </main>
      <LandingFooter />
    </div>
  );
}
