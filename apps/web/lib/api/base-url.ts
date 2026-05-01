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
