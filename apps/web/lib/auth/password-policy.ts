/** 서버(app/services/auth/signup_service.validate_password)와 동일한 규칙. */

export const PASSWORD_HINT = "영문 대문자, 특수문자, 숫자 최소 1자 이상 (8자 이상)";

export function checkPasswordPolicy(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Z]/.test(password)) return "영문 대문자를 1자 이상 포함해 주세요.";
  if (!/\d/.test(password)) return "숫자를 1자 이상 포함해 주세요.";
  if (!/[^A-Za-z0-9]/.test(password)) return "특수문자를 1자 이상 포함해 주세요.";
  return null;
}
