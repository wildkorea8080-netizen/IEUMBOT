import { apiClient } from "./client";
import type { AdminInstallGuideResponse } from "./install-guide-types";

export async function getAdminInstallGuide(): Promise<AdminInstallGuideResponse> {
  return apiClient.request<AdminInstallGuideResponse>("/admin/install-guide");
}
