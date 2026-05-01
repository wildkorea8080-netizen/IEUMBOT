function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function shouldUseProxy(envBaseUrl: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const parsed = new URL(envBaseUrl);
    const envHost = parsed.hostname;
    const currentHost = window.location.hostname;
    const isLocalEnv = envHost === "localhost" || envHost === "127.0.0.1";
    const isLocalCurrent = currentHost === "localhost" || currentHost === "127.0.0.1";
    return isLocalEnv && !isLocalCurrent;
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  const envBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.WEB_PUBLIC_API_BASE_URL ??
    "http://localhost:8000/api";

  if (typeof window !== "undefined" && shouldUseProxy(envBaseUrl)) {
    return "/backend-api";
  }

  if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_API_BASE_URL && !process.env.WEB_PUBLIC_API_BASE_URL) {
    return "/backend-api";
  }

  return trimTrailingSlash(envBaseUrl);
}
