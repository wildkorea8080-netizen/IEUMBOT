import type { SVGProps } from "react";

export type AdminIconName =
  | "dashboard"
  | "organization"
  | "contract"
  | "billing"
  | "account"
  | "api"
  | "chatbot"
  | "widget"
  | "usage"
  | "logs"
  | "system"
  | "notification"
  | "security"
  | "knowledge"
  | "conversation"
  | "users"
  | "ai"
  | "spark"
  | "refresh"
  | "download"
  | "plus"
  | "Search"
  | "search"
  | "empty"
  | "success"
  | "warning";

type IconProps = SVGProps<SVGSVGElement> & {
  name: AdminIconName;
};

function StrokeIcon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function AdminIcon({ name, className = "h-4 w-4", ...props }: IconProps) {
  switch (name) {
    case "dashboard":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M4 13h7V4H4z" />
          <path d="M13 20h7v-9h-7z" />
          <path d="M13 11h7V4h-7z" />
          <path d="M4 20h7v-5H4z" />
        </StrokeIcon>
      );
    case "organization":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 10h.01" />
          <path d="M9 14h.01" />
          <path d="M15 10h.01" />
          <path d="M15 14h.01" />
        </StrokeIcon>
      );
    case "contract":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M7 3h10l4 4v14H7z" />
          <path d="M17 3v5h5" />
          <path d="M10 12h8" />
          <path d="M10 16h8" />
        </StrokeIcon>
      );
    case "billing":
      return (
        <StrokeIcon className={className} {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </StrokeIcon>
      );
    case "account":
    case "users":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M20 8v6" />
          <path d="M17 11h6" />
        </StrokeIcon>
      );
    case "api":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="m8 12 3-3-3-3" />
          <path d="m16 6-3 3 3 3" />
          <path d="M14 4 10 20" />
        </StrokeIcon>
      );
    case "chatbot":
      return (
        <StrokeIcon className={className} {...props}>
          <rect x="4" y="5" width="16" height="12" rx="3" />
          <path d="M9 10h.01" />
          <path d="M15 10h.01" />
          <path d="M8 17v2l4-2h4" />
        </StrokeIcon>
      );
    case "widget":
      return (
        <StrokeIcon className={className} {...props}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </StrokeIcon>
      );
    case "usage":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M4 19h16" />
          <path d="M7 15V9" />
          <path d="M12 15V5" />
          <path d="M17 15v-3" />
        </StrokeIcon>
      );
    case "logs":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </StrokeIcon>
      );
    case "system":
      return (
        <StrokeIcon className={className} {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V22a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.96 20a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.96c.64.26 1.18.82 1.56 1.04H21a2 2 0 1 1 0 4h-.09c-.74 0-1.3.4-1.56 1Z" />
        </StrokeIcon>
      );
    case "notification":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 1 0-12 0v3.17c0 .53-.21 1.04-.59 1.41L4 17h5" />
          <path d="M9 17a3 3 0 0 0 6 0" />
        </StrokeIcon>
      );
    case "security":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M12 3 5 6v5c0 5 3.4 9.4 7 10 3.6-.6 7-5 7-10V6z" />
          <path d="m9.5 12 1.8 1.8 3.7-3.8" />
        </StrokeIcon>
      );
    case "knowledge":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        </StrokeIcon>
      );
    case "conversation":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M7 10h10" />
          <path d="M7 14h6" />
          <path d="M5 19v-2a3 3 0 0 1 3-3h11a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v12Z" />
        </StrokeIcon>
      );
    case "ai":
    case "spark":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="m12 3 1.9 4.8L19 9.7l-4.2 2.7L16 18l-4-2.8L8 18l1.2-5.6L5 9.7l5.1-1.9Z" />
        </StrokeIcon>
      );
    case "refresh":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15.5-6.36L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15.5 6.36L3 16" />
        </StrokeIcon>
      );
    case "download":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </StrokeIcon>
      );
    case "plus":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </StrokeIcon>
      );
    case "Search":
    case "search":
      return (
        <StrokeIcon className={className} {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </StrokeIcon>
      );
    case "success":
      return (
        <StrokeIcon className={className} {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.4 2.4 4.6-4.8" />
        </StrokeIcon>
      );
    case "warning":
      return (
        <StrokeIcon className={className} {...props}>
          <path d="M12 3 2.5 20h19Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </StrokeIcon>
      );
    case "empty":
    default:
      return (
        <StrokeIcon className={className} {...props}>
          <rect x="4" y="5" width="16" height="14" rx="3" />
          <path d="M8 10h8" />
          <path d="M8 14h5" />
        </StrokeIcon>
      );
  }
}
