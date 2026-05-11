const ADMIN_ACCESS_TOKEN_KEY = "ieumbot_admin_access_token";
const ADMIN_BASE_ACCESS_TOKEN_KEY = "ieumbot_admin_base_access_token";
const ADMIN_IMPERSONATION_STATE_KEY = "ieumbot_admin_impersonation_state";
export const ADMIN_IMPERSONATION_EVENT = "ieumbot-admin-impersonation";

export type AdminImpersonationState = {
  organizationId: string;
  organizationName: string;
  reason: string;
  expiresAt: string;
};

function dispatchImpersonationEvent(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(ADMIN_IMPERSONATION_EVENT));
}

export function getAdminAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const sessionToken = sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
  if (sessionToken) {
    return sessionToken;
  }
  const legacyToken = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
  if (legacyToken) {
    sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, legacyToken);
    localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  }
  return legacyToken;
}

export function setAdminAccessToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, token);
}

export function beginAdminImpersonation(params: {
  impersonationToken: string;
  organizationId: string;
  organizationName: string;
  reason: string;
  expiresAt: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }
  const currentToken = getAdminAccessToken();
  if (currentToken && !sessionStorage.getItem(ADMIN_BASE_ACCESS_TOKEN_KEY)) {
    sessionStorage.setItem(ADMIN_BASE_ACCESS_TOKEN_KEY, currentToken);
  }
  sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, params.impersonationToken);
  sessionStorage.setItem(
    ADMIN_IMPERSONATION_STATE_KEY,
    JSON.stringify({
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      reason: params.reason,
      expiresAt: params.expiresAt,
    } as AdminImpersonationState),
  );
  // 이전 기관의 챗봇 선택 정보를 초기화해 다른 기관 챗봇이 잔류하지 않도록 한다.
  localStorage.removeItem("ieumbot_admin_ai_chatbot_id");
  localStorage.removeItem("ieumbot_admin_selected_chatbot");
  dispatchImpersonationEvent();
}

export function readAdminImpersonation(): AdminImpersonationState | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(ADMIN_IMPERSONATION_STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AdminImpersonationState;
  } catch {
    sessionStorage.removeItem(ADMIN_IMPERSONATION_STATE_KEY);
    return null;
  }
}

export function endAdminImpersonation(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const baseToken = sessionStorage.getItem(ADMIN_BASE_ACCESS_TOKEN_KEY);
  if (!baseToken) {
    return false;
  }
  sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, baseToken);
  sessionStorage.removeItem(ADMIN_BASE_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_IMPERSONATION_STATE_KEY);
  dispatchImpersonationEvent();
  return true;
}

export function clearCurrentAdminAccessToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  dispatchImpersonationEvent();
}

export function clearAdminAccessToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_BASE_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_IMPERSONATION_STATE_KEY);
  localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  dispatchImpersonationEvent();
}
