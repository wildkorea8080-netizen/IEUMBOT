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
