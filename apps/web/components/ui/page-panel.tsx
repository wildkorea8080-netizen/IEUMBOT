import type { ReactNode } from "react";

import { SectionCard } from "./section-card";

type PagePanelProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function PagePanel({ title, description, children }: PagePanelProps) {
  return (
    <SectionCard title={title} description={description} contentClassName={children ? "" : "pt-0"}>
      {children}
    </SectionCard>
  );
}
