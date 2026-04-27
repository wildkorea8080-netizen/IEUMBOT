import { apiClient } from "./client";
import type { AdminBillingUsageResponse } from "./billing-types";

export async function getAdminBillingUsage(): Promise<AdminBillingUsageResponse> {
  return apiClient.request<AdminBillingUsageResponse>("/admin/billing");
}
