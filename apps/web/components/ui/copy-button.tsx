"use client";

import { useEffect, useState } from "react";

type CopyButtonProps = {
  text: string;
  label?: string;
  successMessage?: string;
  errorMessage?: string;
  disabled?: boolean;
  onCopied?: (message: string, tone: "success" | "error") => void;
};

export function CopyButton({
  text,
  label = "복사",
  successMessage = "복사되었습니다.",
  errorMessage = "복사에 실패했습니다.",
  disabled,
  onCopied,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.(successMessage, "success");
    } catch {
      onCopied?.(errorMessage, "error");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={disabled}
      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
    >
      {copied ? "복사됨" : label}
    </button>
  );
}
