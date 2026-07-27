import { apiClient } from "./index";

export type OrganizationBranding = {
  organizationId: string;
  organizationName: string;
  /** base64 data URL 또는 외부 URL. null이면 기본 이음봇 마크 표시. */
  logoUrl: string | null;
};

/** 관리자 콘솔 좌측 상단 로고·기관명 조회 (사이드바 표시용). */
export async function getOrganizationBranding(): Promise<OrganizationBranding> {
  return apiClient.request<OrganizationBranding>("/admin/organization/branding");
}

/** 기관 로고 설정/제거 (기관관리자). null 또는 빈 문자열이면 제거. */
export async function updateOrganizationBranding(
  logoUrl: string | null,
): Promise<OrganizationBranding> {
  return apiClient.request<OrganizationBranding>("/admin/organization/branding", {
    method: "PUT",
    body: { logoUrl },
  });
}

/** 브랜딩 변경 시 사이드바가 즉시 갱신되도록 발행하는 이벤트. */
export const ORG_BRANDING_EVENT = "ieum:org-branding-updated";

export function emitOrgBrandingUpdated(branding: OrganizationBranding): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ORG_BRANDING_EVENT, { detail: branding }));
}

// ── IP 접근제어 ──────────────────────────────────────────────

export type OrganizationIpAccess = {
  allowedIps: string[];
  enabled: boolean;
  /** 호출자의 현재 접속 IP (설정 화면 안내용). */
  currentIp: string | null;
};

/** 기관 IP 접근제어 현황 조회 (기관관리자). */
export async function getOrganizationIpAccess(): Promise<OrganizationIpAccess> {
  return apiClient.request<OrganizationIpAccess>("/admin/organization/ip-access");
}

/** 허용 IP/CIDR 목록 저장 (기관관리자). 빈 배열이면 제한 해제. */
export async function updateOrganizationIpAccess(
  allowedIps: string[],
): Promise<OrganizationIpAccess> {
  return apiClient.request<OrganizationIpAccess>("/admin/organization/ip-access", {
    method: "PUT",
    body: { allowedIps },
  });
}
