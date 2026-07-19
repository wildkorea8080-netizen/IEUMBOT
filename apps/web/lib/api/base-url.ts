function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "/backend-api";
  }

  const envBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.WEB_PUBLIC_API_BASE_URL ??
    "http://localhost:8000/api";

  return trimTrailingSlash(envBaseUrl);
}

/**
 * SNS OAuth 시작 URL — 반드시 API 오리진으로 **직접** 이동해야 한다.
 * (/backend-api 프록시로 가면 Next가 서버측에서 307→제공사 리다이렉트를 대신 따라가 깨진다.
 *  브라우저가 직접 제공사로 이동해야 OAuth 흐름이 성립.)
 * NEXT_PUBLIC_API_BASE_URL은 클라이언트 번들에 인라인되는 공개 값(예: https://api.deepsecu.co.kr/api).
 */
export function getOAuthStartUrl(provider: string): string {
  const base = trimTrailingSlash(
    process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.WEB_PUBLIC_API_BASE_URL ??
      "http://localhost:8000/api",
  );
  return `${base}/auth/oauth/${provider}/start`;
}
