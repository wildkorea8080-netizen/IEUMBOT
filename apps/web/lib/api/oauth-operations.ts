import { apiClient } from "./index";

/**
 * 활성화된 SNS 로그인 제공사 목록. client_id가 설정된 제공사만 반환된다.
 * (미설정이면 [] → 프론트가 버튼을 숨김.) 공개 엔드포인트라 인증 불필요.
 */
export async function getOAuthProviders(): Promise<string[]> {
  try {
    const res = await apiClient.request<{ providers: string[] }>("/auth/oauth/providers");
    return Array.isArray(res.providers) ? res.providers : [];
  } catch {
    return [];
  }
}
