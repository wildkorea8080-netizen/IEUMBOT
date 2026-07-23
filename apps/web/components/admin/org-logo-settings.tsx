"use client";

import { useEffect, useRef, useState } from "react";

import { ApiClientError } from "../../lib/api";
import {
  emitOrgBrandingUpdated,
  getOrganizationBranding,
  updateOrganizationBranding,
  type OrganizationBranding,
} from "../../lib/api/organization";

const MAX_FILE_BYTES = 512 * 1024; // 512KB — 사이드바 로고엔 충분
const ACCEPTED = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function errorText(code: string | undefined): string {
  switch (code) {
    case "LOGO_TOO_LARGE":
      return "이미지 용량이 너무 큽니다. 더 작은 파일을 사용해 주세요.";
    case "LOGO_INVALID_FORMAT":
      return "지원하지 않는 형식입니다. PNG·JPG·WEBP·SVG 이미지를 올려 주세요.";
    default:
      return "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export function OrgLogoSettings() {
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void getOrganizationBranding()
      .then((res) => {
        if (!mounted) return;
        setBranding(res);
        setPreview(res.logoUrl);
      })
      .catch(() => {
        /* 무시 — 기본 상태 유지 */
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handlePick = async (file: File | undefined) => {
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage({ kind: "err", text: "이미지 용량은 512KB 이하여야 합니다." });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPreview(dataUrl);
    } catch {
      setMessage({ kind: "err", text: "이미지를 읽지 못했습니다." });
    }
  };

  const save = async (logoUrl: string | null) => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await updateOrganizationBranding(logoUrl);
      setBranding(res);
      setPreview(res.logoUrl);
      emitOrgBrandingUpdated(res); // 사이드바 즉시 갱신
      setMessage({ kind: "ok", text: logoUrl ? "로고를 저장했습니다." : "로고를 제거했습니다." });
    } catch (error) {
      setMessage({
        kind: "err",
        text: error instanceof ApiClientError ? errorText(error.code) : errorText(undefined),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const dirty = preview !== (branding?.logoUrl ?? null);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-600">
          관리자 콘솔 좌측 상단에 표시되는 기관 로고입니다. 등록하면 기본 &ldquo;이음봇&rdquo; 로고
          대신 기관 로고가 표시됩니다. (권장: 가로형, 512KB 이하 PNG·SVG)
        </p>
      </div>

      {/* 미리보기 — 실제 사이드바와 같은 배경(로고 있으면 흰색) */}
      <div className="flex items-center gap-4">
        <div
          className="flex h-[60px] w-[232px] shrink-0 items-center px-4"
          style={{
            background: preview ? "#fff" : "#2563eb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
          }}
        >
          {preview ? (
            <img
              src={preview}
              alt="로고 미리보기"
              style={{ maxHeight: 40, maxWidth: 180, objectFit: "contain" }}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 900,
                  color: "#fff",
                }}
              >
                이
              </div>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>이음봇</span>
            </div>
          )}
        </div>
        <span className="text-xs text-slate-400">사이드바 미리보기</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(event) => void handlePick(event.target.files?.[0])}
      />

      {message ? (
        <p
          className={
            message.kind === "ok"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
              : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          }
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          이미지 선택
        </button>
        <button
          type="button"
          disabled={!dirty || isSaving || !preview}
          onClick={() => void save(preview)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "저장 중..." : "로고 저장"}
        </button>
        {branding?.logoUrl ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void save(null)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            로고 제거
          </button>
        ) : null}
      </div>
    </div>
  );
}
