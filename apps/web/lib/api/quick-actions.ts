import { apiClient } from "./index";
import type {
  MenuActionType,
  MenuNode,
  MenuNodeCreateInput,
  MenuNodeUpdateInput,
} from "./quick-actions-types";

/**
 * 탐색 메뉴(2단 가이드 메뉴) 관리자 API.
 *
 * 서버는 규칙 위반을 {"detail": {"code", "message"}} 형태로 돌려주고,
 * 공용 client.ts가 그 message를 ApiClientError.message로 전달한다.
 * 호출부는 err.message를 그대로 사용자에게 보여주면 된다.
 */

export async function getMenuTree(chatbotId: string): Promise<MenuNode[]> {
  return apiClient.request<MenuNode[]>(
    `/admin/quick-actions?chatbotId=${encodeURIComponent(chatbotId)}`,
  );
}

export async function createMenuNode(input: MenuNodeCreateInput): Promise<MenuNode> {
  return apiClient.request<MenuNode>("/admin/quick-actions", { method: "POST", body: input });
}

export async function updateMenuNode(
  nodeId: string,
  input: MenuNodeUpdateInput,
): Promise<MenuNode> {
  return apiClient.request<MenuNode>(`/admin/quick-actions/${encodeURIComponent(nodeId)}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteMenuNode(nodeId: string, chatbotId: string): Promise<void> {
  await apiClient.request<void>(
    `/admin/quick-actions/${encodeURIComponent(nodeId)}?chatbotId=${encodeURIComponent(chatbotId)}`,
    { method: "DELETE" },
  );
}

export async function reorderMenuNodes(
  chatbotId: string,
  items: { id: string; sortOrder: number }[],
): Promise<{ updated: number }> {
  return apiClient.request<{ updated: number }>("/admin/quick-actions/reorder", {
    method: "POST",
    body: { chatbotId, items },
  });
}

export type { MenuActionType, MenuNode, MenuNodeCreateInput, MenuNodeUpdateInput };
