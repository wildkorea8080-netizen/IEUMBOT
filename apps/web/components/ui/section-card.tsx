import type { ReactNode } from "react";

type SectionCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  contentClassName = "",
}: SectionCardProps) {
  return (
    <section
      className={[
        "rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-shadow hover:shadow-md/5",
        className,
      ].join(" ")}
    >
      {title || description || action ? (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4 sm:px-6">
          <div>
            {title ? <h2 className="text-base font-semibold text-slate-950">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className={["px-5 py-5 sm:px-6", contentClassName].join(" ")}>{children}</div>
    </section>
  );
}
