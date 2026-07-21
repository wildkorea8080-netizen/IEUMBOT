import { apiClient } from "./index";

export type SignupConfig = {
  enabled: boolean;
  emailDeliveryReady: boolean;
};

/** 회원가입 기능 활성 여부(비활성이면 탭 자체를 숨김). */
export async function getSignupConfig(): Promise<SignupConfig> {
  try {
    return await apiClient.request<SignupConfig>("/auth/signup/config");
  } catch {
    return { enabled: false, emailDeliveryReady: false };
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
