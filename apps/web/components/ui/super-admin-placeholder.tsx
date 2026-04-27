import { PagePanel } from "./page-panel";

type SuperAdminPlaceholderProps = {
  title: string;
  description: string;
  bullets: string[];
};

export function SuperAdminPlaceholder({ title, description, bullets }: SuperAdminPlaceholderProps) {
  return (
    <PagePanel title={title} description={description}>
      <p className="text-sm text-slate-700">이 화면은 다음 단계에서 구현됩니다.</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </PagePanel>
  );
}

