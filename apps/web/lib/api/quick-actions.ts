import { ApiClientError } from "./client";
import { clearCurrentAdminAccessToken, getAdminAccessToken } from "../auth/token";
import { getApiBaseUrl } from "./base-url";
import type {
  MenuActionType,
  MenuNode,
  MenuNodeCreateInput,
  MenuNodeUpdateInput,
} from "./quick-actions-types";

/**
 * 탐색 메뉴 전용 요청 헬퍼.
 *
 * app/api/admin/quick_actions_router.py 는 검증 오류를
 * `{"detail": {"code": "...", "message": "..."}}` 형태(사람이 읽는 한국어 message 포함)로
 * 반환한다. 공용 apiClient(lib/api/client.ts)는 `{"detail": "문자열"}` 또는
 * `{"error": {code, message}}` 형태만 파싱하도록 되어 있어, 이 라우터의 message가
 * 담긴 object형 detail은 인식하지 못하고 "API request failed (400)" 같은 일반 메시지로
 * 덮어써 버린다(client.ts는 이번 작업 범위 밖이라 수정하지 않음).
 * 이 라우터가 돌려주는 message(예: "메뉴는 2단까지만 만들 수 있습니다.")를 그대로
 * 사용자에게 보여줘야 하므로, 여기서 동일한 인증/베이스URL 규칙을 따르되 detail을
 * 올바르게 파싱해 ApiClientError를 던지는 별도 헬퍼를 둔다.
 */
async function request<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const token = getAdminAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearCurrentAdminAccessToken();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    const detail = (payload as { detail?: unknown } | undefined)?.detail;
    let code = `HTTP_${response.status}`;
    let message = `API request failed (${response.status})`;
    if (typeof detail === "string") {
      code = detail;
      message = detail;
    } else if (detail && typeof detail === "object") {
      const detailObject = detail as { code?: unknown; message?: unknown };
      if (typeof detailObject.code === "string") code = detailObject.code;
      if (typeof detailObject.message === "string") message = detailObject.message;
    }

    throw new ApiClientError(message, response.status, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getMenuTree(chatbotId: string): Promise<MenuNode[]> {
  return request<MenuNode[]>(`/admin/quick-actions?chatbotId=${encodeURIComponent(chatbotId)}`);
}

export async function createMenuNode(input: MenuNodeCreateInput): Promise<MenuNode> {
  return request<MenuNode>("/admin/quick-actions", { method: "POST", body: input });
}

export async function updateMenuNode(
  nodeId: string,
  input: MenuNodeUpdateInput,
): Promise<MenuNode> {
  return request<MenuNode>(`/admin/quick-actions/${nodeId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteMenuNode(nodeId: string, chatbotId: string): Promise<void> {
  await request<void>(
    `/admin/quick-actions/${nodeId}?chatbotId=${encodeURIComponent(chatbotId)}`,
    { method: "DELETE" },
  );
}

export async function reorderMenuNodes(
  chatbotId: string,
  items: { id: string; sortOrder: number }[],
): Promise<{ updated: number }> {
  return request<{ updated: number }>("/admin/quick-actions/reorder", {
    method: "POST",
    body: { chatbotId, items },
  });
}

export type { MenuActionType, MenuNode, MenuNodeCreateInput, MenuNodeUpdateInput };
