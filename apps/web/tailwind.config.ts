import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
        },
        success: {
          50:  "#f0fdf4",
          500: "#22c55e",
          600: "#16a34a",
        },
        warning: {
          50:  "#fffbeb",
          500: "#f59e0b",
          600: "#d97706",
        },
        danger: {
          50:  "#fef2f2",
          500: "#ef4444",
          600: "#dc2626",
        },
        neutral: {
          0:   "#ffffff",
          50:  "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
      },
      borderRadius: {
        "xl":  "12px",
        "2xl": "16px",
        "3xl": "24px",
      },
      boxShadow: {
        "card":      "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover":"0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
        "sidebar":   "1px 0 0 #e2e8f0",
      },
    },
  },
  plugins: [],
};

export default config;
