import type { ApiClientOptions, ApiErrorPayload, ApiRequestOptions } from "./types";
import { clearCurrentAdminAccessToken, getAdminAccessToken } from "../auth/token";
import { getApiBaseUrl } from "./base-url";

export class ApiClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? getApiBaseUrl();
    this.defaultHeaders = options.headers ?? {};
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const token = getAdminAccessToken();
    const authHeader = token ? `Bearer ${token}` : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.defaultHeaders,
      ...options.headers
    };

    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: "include"
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearCurrentAdminAccessToken();
      }

      let payload: ApiErrorPayload | undefined;
      try {
        payload = (await response.json()) as ApiErrorPayload;
      } catch {
        payload = undefined;
      }
      // FastAPI의 detail은 두 형태로 온다:
      //   "FAQ_NOT_FOUND"                     → 코드만 (대부분의 라우터)
      //   {code, message}                     → 코드 + 사용자에게 보여줄 메시지
      // 후자를 문자열로만 취급하면 서버가 보낸 안내 문구가 버려지고
      // "API request failed (400)" 같은 일반 메시지로 덮인다.
      const rawDetail = (payload as { detail?: unknown } | undefined)?.detail;
      const detailObject =
        rawDetail !== null && typeof rawDetail === "object"
          ? (rawDetail as { code?: unknown; message?: unknown })
          : undefined;
      const detailCode =
        typeof rawDetail === "string"
          ? rawDetail
          : typeof detailObject?.code === "string"
            ? detailObject.code
            : undefined;
      const detailMessage =
        typeof rawDetail === "string"
          ? rawDetail
          : typeof detailObject?.message === "string"
            ? detailObject.message
            : undefined;
      const errorCode = payload?.error?.code ?? detailCode ?? `HTTP_${response.status}`;
      const message =
        payload?.error?.message ?? detailMessage ?? `API request failed (${response.status})`;
      throw new ApiClientError(message, response.status, errorCode);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

export const apiClient = new ApiClient();

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}
