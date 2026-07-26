/** 전역 비밀번호 정책 — 서버(app/services/password_policy_service)와 동일한 규칙.
 *
 * 슈퍼관리자가 설정한 정책을 GET /auth/password-policy 로 받아 힌트·검증에 사용한다.
 * 서버가 최종 강제하므로, 폼은 UX(힌트/즉시검증)용으로만 이 값을 쓴다.
 */
import { apiClient } from "../api";

export type PasswordPolicy = {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: false,
  requireDigit: true,
  requireSymbol: true,
};

/** 현재 적용 중인 정책 조회(실패 시 기본값). */
export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  try {
    return await apiClient.request<PasswordPolicy>("/auth/password-policy");
  } catch {
    return DEFAULT_PASSWORD_POLICY;
  }
}

/** 정책 기반 힌트 문구. */
export function passwordHint(policy: PasswordPolicy): string {
  const types = [
    policy.requireUppercase && "영문 대문자",
    policy.requireLowercase && "영문 소문자",
    policy.requireDigit && "숫자",
    policy.requireSymbol && "특수문자",
  ].filter(Boolean);
  const typePart = types.length ? `${types.join("·")} 각 1자 이상 ` : "";
  return `${typePart}(${policy.minLength}자 이상)`;
}

/** 정책 기반 검증. 위반 시 사용자 문구, 통과 시 null. */
export function checkPassword(policy: PasswordPolicy, password: string): string | null {
  if (password.length < policy.minLength) {
    return `비밀번호는 ${policy.minLength}자 이상이어야 합니다.`;
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return "영문 대문자를 1자 이상 포함해 주세요.";
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return "영문 소문자를 1자 이상 포함해 주세요.";
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    return "숫자를 1자 이상 포함해 주세요.";
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    return "특수문자를 1자 이상 포함해 주세요.";
  }
  return null;
}

// ── 하위 호환(기본 정책 기준 정적 값) ─────────────────────────────
export const PASSWORD_HINT = passwordHint(DEFAULT_PASSWORD_POLICY);

export function checkPasswordPolicy(password: string): string | null {
  return checkPassword(DEFAULT_PASSWORD_POLICY, password);
}
