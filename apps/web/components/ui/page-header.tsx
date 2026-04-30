import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: string[];
  badge?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, breadcrumbs, badge, actions }: PageHeaderProps) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm sm:px-6">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
          {breadcrumbs.map((item, index) => (
            <span key={`${item}-${index}`} className="flex items-center gap-2">
              {index > 0 ? <span className="text-slate-300">/</span> : null}
              <span>{item}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
            {badge}
          </div>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
