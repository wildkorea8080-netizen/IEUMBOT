import { apiClient } from "./index";

export type PasswordPolicy = {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
};

/** 슈퍼관리자: 현재 전역 비밀번호 정책 조회. */
export async function getSuperAdminPasswordPolicy(): Promise<PasswordPolicy> {
  return apiClient.request<PasswordPolicy>("/super-admin/system/password-policy");
}

/** 슈퍼관리자: 전역 비밀번호 정책 저장. */
export async function updateSuperAdminPasswordPolicy(
  policy: PasswordPolicy,
): Promise<PasswordPolicy> {
  return apiClient.request<PasswordPolicy>("/super-admin/system/password-policy", {
    method: "PUT",
    body: policy,
  });
}
