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
      const detail = typeof (payload as { detail?: unknown } | undefined)?.detail === "string"
        ? String((payload as { detail?: string }).detail)
        : undefined;
      const errorCode = payload?.error?.code ?? detail ?? `HTTP_${response.status}`;
      const message = payload?.error?.message ?? detail ?? `API request failed (${response.status})`;
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
