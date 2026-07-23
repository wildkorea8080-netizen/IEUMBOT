import { apiClient } from "./index";

export type SignupConfig = {
  enabled: boolean;
  emailDeliveryReady: boolean;
  passwordResetReady: boolean;
  memberSignupReady: boolean;
};

/** 회원가입·비밀번호 찾기 가용 여부(비활성이면 UI 자체를 숨김). */
export async function getSignupConfig(): Promise<SignupConfig> {
  try {
    return await apiClient.request<SignupConfig>("/auth/signup/config");
  } catch {
    return {
      enabled: false,
      emailDeliveryReady: false,
      passwordResetReady: false,
      memberSignupReady: false,
    };
  }
}

/** 기관사용자(멤버) 가입 신청 — 기관 코드로 기존 기관에 합류(승인 대기). */
export async function memberSignup(input: {
  email: string;
  password: string;
  orgCode: string;
  termsAgreed: boolean;
}): Promise<{ email: string; organizationName: string; verificationSent: boolean }> {
  return apiClient.request("/auth/signup/member", { method: "POST", body: input });
}

/** 멤버 가입 관련 에러 코드 → 사용자 문구. */
export function memberSignupErrorMessage(code: string | undefined): string {
  switch (code) {
    case "ORG_CODE_REQUIRED":
      return "기관 코드를 입력해 주세요.";
    case "ORG_NOT_FOUND":
      return "해당 기관 코드를 찾을 수 없습니다. 기관관리자에게 코드를 확인해 주세요.";
    case "ORG_NOT_AVAILABLE":
      return "현재 가입할 수 없는 기관입니다. 기관관리자에게 문의해 주세요.";
    case "MEMBER_SIGNUP_DISABLED":
      return "현재 기관사용자 가입이 열려 있지 않습니다.";
    default:
      return signupErrorMessage(code);
  }
}

/** 비밀번호 재설정 메일 요청 (계정 존재 여부는 응답으로 알 수 없음). */
export async function forgotPassword(email: string): Promise<void> {
  await apiClient.request("/auth/password/forgot", { method: "POST", body: { email } });
}

/** 토큰으로 새 비밀번호 설정. */
export async function resetPassword(
  token: string,
  password: string,
): Promise<{ email: string; reset: boolean }> {
  return apiClient.request<{ email: string; reset: boolean }>("/auth/password/reset", {
    method: "POST",
    body: { token, password },
  });
}

/** 재설정 관련 에러 코드 → 사용자 문구. */
export function resetErrorMessage(code: string | undefined): string {
  switch (code) {
    case "TOKEN_EXPIRED":
      return "재설정 링크가 만료되었습니다. 다시 요청해 주세요.";
    case "INVALID_TOKEN":
      return "유효하지 않은 재설정 링크입니다. 메일의 링크를 다시 확인해 주세요.";
    case "TOO_MANY_REQUESTS":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return signupErrorMessage(code);
  }
}

export async function signup(input: {
  email: string;
  password: string;
  termsAgreed: boolean;
}): Promise<{ email: string; verificationSent: boolean }> {
  return apiClient.request<{ email: string; verificationSent: boolean }>("/auth/signup", {
    method: "POST",
    body: input,
  });
}

export async function verifyEmail(token: string): Promise<{ email: string; verified: boolean }> {
  return apiClient.request<{ email: string; verified: boolean }>("/auth/verify-email", {
    method: "POST",
    body: { token },
  });
}

export async function resendVerification(email: string): Promise<void> {
  await apiClient.request("/auth/resend-verification", {
    method: "POST",
    body: { email },
  });
}

/** 서버 에러 코드 → 사용자 문구. */
export function signupErrorMessage(code: string | undefined): string {
  switch (code) {
    case "EMAIL_ALREADY_EXISTS":
      return "이미 가입된 이메일입니다.";
    case "INVALID_EMAIL":
      return "이메일 주소 형식이 올바르지 않습니다.";
    case "TERMS_NOT_AGREED":
      return "이용약관 및 개인정보처리방침에 동의해 주세요.";
    case "PASSWORD_LENGTH":
      return "비밀번호는 8자 이상이어야 합니다.";
    case "PASSWORD_NEEDS_UPPERCASE":
      return "비밀번호에 영문 대문자를 1자 이상 포함해 주세요.";
    case "PASSWORD_NEEDS_DIGIT":
      return "비밀번호에 숫자를 1자 이상 포함해 주세요.";
    case "PASSWORD_NEEDS_SYMBOL":
      return "비밀번호에 특수문자를 1자 이상 포함해 주세요.";
    case "TOO_MANY_REQUESTS":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    case "SIGNUP_DISABLED":
      return "현재 회원가입이 열려 있지 않습니다.";
    default:
      return "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
