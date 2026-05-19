"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { Save, Loader2, CheckCircle, Plus } from "lucide-react";

import { writeSelectedAdminChatbot } from "../../lib/admin-ui/selected-chatbot";

export const AI_CHATBOT_STORAGE_KEY = "ieumbot_admin_ai_chatbot_id";

const AI_TABS = [
  { href: "/admin/ai/basic",        label: "AI 기본 설정" },
  { href: "/admin/ai/style",        label: "대화 스타일" },
  { href: "/admin/answer-settings", label: "고급 설정" },
] as const;

type ChatbotOption = { id: string; name: string; status: string };

type AiSettingsLayoutProps = {
  activeHref: string;
  chatbotOptions: ChatbotOption[];
  selectedChatbotId: string;
  selectedChatbotName?: string;
  onSelectChatbot: (chatbotId: string) => void;
  notice?: ReactNode;
  children: ReactNode;
  // compat
  title?: string;
  description?: string;
  toolbar?: ReactNode;
};

export function AiSettingsLayout({
  activeHref,
  chatbotOptions,
  selectedChatbotId,
  selectedChatbotName,
  onSelectChatbot,
  notice,
  children,
}: AiSettingsLayoutProps) {
  useEffect(() => {
    if (!selectedChatbotId || !selectedChatbotName) return;
    window.localStorage.setItem(AI_CHATBOT_STORAGE_KEY, selectedChatbotId);
    writeSelectedAdminChatbot({ id: selectedChatbotId, name: selectedChatbotName });
  }, [selectedChatbotId, selectedChatbotName]);

  return (
    <div>
      {/* 챗봇 선택기 */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 mb-6">
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#64748b", marginBottom: 6 }}>
          설정할 챗봇을 선택하세요
        </label>
        <select
          value={selectedChatbotId}
          onChange={e => onSelectChatbot(e.target.value)}
          className="input-field"
          style={{ maxWidth: 320 }}
        >
          {chatbotOptions.map(item => (
            <option key={item.id} value={item.id}>{item.name} ({item.status})</option>
          ))}
        </select>
        {selectedChatbotName && (
          <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
            현재 챗봇: <strong style={{ color: "#1e293b" }}>{selectedChatbotName}</strong>
          </p>
        )}
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex" style={{ borderBottom: "1px solid #e2e8f0", marginBottom: 24, gap: 4 }}>
        {AI_TABS.map(tab => {
          const isActive = activeHref === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#2563eb" : "#64748b",
                borderBottom: `2px solid ${isActive ? "#2563eb" : "transparent"}`,
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                background: isActive ? "#eff6ff" : "transparent",
                textDecoration: "none",
                borderRadius: "8px 8px 0 0",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {notice}

      {chatbotOptions.length === 0 && (
        <div style={{ margin: "8px 0 20px", padding: "20px 24px", borderRadius: 12, border: "1px solid #bfdbfe", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1e40af", marginBottom: 4 }}>아직 챗봇이 없습니다</p>
            <p style={{ fontSize: 13, color: "#3b82f6" }}>챗봇을 먼저 생성해야 설정을 구성할 수 있습니다.</p>
          </div>
          <Link
            href="/admin/chatbots"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: "#2563eb", color: "white", fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            챗봇 생성하기
          </Link>
        </div>
      )}

      {children}
    </div>
  );
}

// ── 저장 버튼 (페이지 하단용) ─────────────────────────────

export function SaveButton({
  onClick,
  disabled,
  isSaving,
}: {
  onClick: () => void;
  disabled?: boolean;
  isSaving?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 32 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="btn-primary flex items-center gap-2"
        style={{ padding: "10px 32px", fontSize: 15, opacity: disabled ? 0.5 : 1 }}
      >
        {isSaving ? (
          <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />저장 중...</>
        ) : (
          <><Save style={{ width: 16, height: 16 }} />저장하기</>
        )}
      </button>
    </div>
  );
}

// ── 토스트 (우측 하단 고정) ───────────────────────────────

export function ToastNotice(props: { tone: "success" | "error"; message: string }) {
  const isSuccess = props.tone === "success";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 32,
        right: 32,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 20px",
        borderRadius: 10,
        border: `1px solid ${isSuccess ? "#22c55e" : "#fca5a5"}`,
        background: isSuccess ? "#f0fdf4" : "#fef2f2",
        color: isSuccess ? "#16a34a" : "#dc2626",
        fontSize: 14,
        fontWeight: 500,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        animation: "slideIn 0.2s ease",
      }}
    >
      {isSuccess && <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }} />}
      {props.message}
    </div>
  );
}

// ── 섹션 카드 ─────────────────────────────────────────────

export function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 mb-4">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: description ? 4 : 16 }}>
        {icon && (
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: 0 }}>{title}</h2>
      </div>
      {description && (
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16, marginLeft: icon ? 42 : 0 }}>{description}</p>
      )}
      {children}
    </div>
  );
}

// ── 폼 필드 유틸 ─────────────────────────────────────────

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#334155", marginBottom: 6 }}>{children}</span>;
}

export function TextInputField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <div>
      <FieldLabel>{props.label}</FieldLabel>
      <input value={props.value} onChange={e => props.onChange(e.target.value)} placeholder={props.placeholder} className="input-field" />
      {props.helper && <span style={{ display: "block", fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{props.helper}</span>}
    </div>
  );
}

export function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <div>
      <FieldLabel>{props.label}</FieldLabel>
      <textarea rows={props.rows ?? 4} value={props.value} onChange={e => props.onChange(e.target.value)} placeholder={props.placeholder} className="input-field" />
      {props.helper && <span style={{ display: "block", fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{props.helper}</span>}
    </div>
  );
}

// ── 토글 스위치 ───────────────────────────────────────────

export function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        display: "inline-flex",
        width: 44,
        height: 24,
        borderRadius: 99,
        background: checked ? "#2563eb" : "#cbd5e1",
        border: "none",
        cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span style={{
        position: "absolute",
        top: 2,
        left: checked ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "white",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

export function ToggleField(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#1e293b" }}>{props.label}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{props.description}</div>
      </div>
      <ToggleSwitch checked={props.checked} onChange={props.onChange} />
    </div>
  );
}

// ── 라디오 카드 그룹 ──────────────────────────────────────

export function RadioCardGroup(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; title: string; description: string; icon?: ReactNode }>;
}) {
  return (
    <div>
      <FieldLabel>{props.label}</FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {props.options.map(option => {
          const selected = props.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => props.onChange(option.value)}
              style={{
                textAlign: "left",
                padding: 16,
                borderRadius: 12,
                border: `2px solid ${selected ? "#2563eb" : "#e2e8f0"}`,
                background: selected ? "#eff6ff" : "white",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {option.icon && <div style={{ marginBottom: 8, fontSize: 20 }}>{option.icon}</div>}
              <div style={{ fontSize: 14, fontWeight: 600, color: selected ? "#1d4ed8" : "#1e293b", marginBottom: 4 }}>
                {option.title}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{option.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
