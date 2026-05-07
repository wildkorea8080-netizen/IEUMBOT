import { apiClient } from "./client";
import type {
  SuperAdminBlueprintApplyRequest,
  SuperAdminBlueprintApplyResponse,
  SuperAdminBlueprintCreateRequest,
  SuperAdminBlueprintListResponse,
  SuperAdminBlueprintResponse,
} from "./super-admin-operations-types";

export async function listSuperAdminBlueprints(): Promise<SuperAdminBlueprintListResponse> {
  return apiClient.request<SuperAdminBlueprintListResponse>("/super-admin/blueprints");
}

export async function createSuperAdminBlueprint(
  body: SuperAdminBlueprintCreateRequest,
): Promise<SuperAdminBlueprintResponse> {
  return apiClient.request<SuperAdminBlueprintResponse>("/super-admin/blueprints", {
    method: "POST",
    body,
  });
}

export async function applySuperAdminBlueprint(
  blueprintId: string,
  body: SuperAdminBlueprintApplyRequest,
): Promise<SuperAdminBlueprintApplyResponse> {
  return apiClient.request<SuperAdminBlueprintApplyResponse>(`/super-admin/blueprints/${blueprintId}/apply`, {
    method: "POST",
    body,
  });
}
