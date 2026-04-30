import { EmptyState } from "./empty-state";
import { SectionCard } from "./section-card";

type SuperAdminPlaceholderProps = {
  title: string;
  description: string;
  bullets: string[];
};

export function SuperAdminPlaceholder({ title, description, bullets }: SuperAdminPlaceholderProps) {
  return (
    <SectionCard title={title} description={description}>
      <EmptyState
        title="데이터 연결 또는 상세 운영 UI가 준비 중입니다"
        description="현재 화면은 공통 SaaS 스타일로 정리되었으며, 아래 항목을 중심으로 단계적으로 확장됩니다."
        icon="system"
      />
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {bullets.map((bullet, index) => (
          <div key={bullet} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</p>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{bullet}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
