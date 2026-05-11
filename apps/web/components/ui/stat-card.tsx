import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

type StatCardColor = "blue" | "green" | "orange" | "red";

interface StatCardChange {
  value: number;
  label?: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode | string;  // string은 하위 호환 (무시)
  change?: StatCardChange | null;
  color?: StatCardColor;
  // 하위 호환 props (super-admin 등 구버전 사용처)
  hint?: ReactNode;
  tone?: string;
}

const COLOR_MAP: Record<StatCardColor, { bg: string; iconColor: string }> = {
  blue:   { bg: "#eff6ff", iconColor: "#2563eb" },
  green:  { bg: "#f0fdf4", iconColor: "#16a34a" },
  orange: { bg: "#fffbeb", iconColor: "#d97706" },
  red:    { bg: "#fef2f2", iconColor: "#dc2626" },
};

export function StatCard({ label, value, icon, change, color = "blue", hint }: StatCardProps) {
  const palette = COLOR_MAP[color];
  const isPositive = change && change.value >= 0;

  return (
    <article
      className="bg-white rounded-xl border border-neutral-200 shadow-card p-6 flex flex-col"
    >
      <div className="flex items-start justify-between">
        <p style={{ fontSize: 12, fontWeight: 500, color: "#64748b", margin: 0 }}>
          {label}
        </p>
        {icon && (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: palette.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: palette.iconColor,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div style={{ fontSize: 28, fontWeight: 700, color: "#1e293b", marginTop: 6, lineHeight: 1.2 }}>
        {value}
      </div>

      {hint != null && (
        <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{hint}</div>
      )}

      {change != null && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
        >
          {isPositive ? (
            <TrendingUp style={{ width: 12, height: 12, color: "#16a34a", flexShrink: 0 }} />
          ) : (
            <TrendingDown style={{ width: 12, height: 12, color: "#dc2626", flexShrink: 0 }} />
          )}
          <span style={{ fontWeight: 600, color: isPositive ? "#16a34a" : "#dc2626" }}>
            {isPositive ? `▲ +${change.value.toFixed(1)}%` : `▼ ${change.value.toFixed(1)}%`}
          </span>
          <span style={{ color: "#94a3b8", marginLeft: 2 }}>
            {change.label ?? "이전 기간 대비"}
          </span>
        </div>
      )}
    </article>
  );
}
