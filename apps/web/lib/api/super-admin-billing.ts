import { apiClient } from "./client";
import type {
  BillingAlertListResponse,
  BillingPlanItem,
  BillingPlanListResponse,
  BillingPlanUpsertRequest,
  SuperAdminBillingByOrganizationResponse,
  SuperAdminBillingSummary,
} from "./super-admin-billing-types";

export async function listSuperAdminBillingPlans(): Promise<BillingPlanListResponse> {
  return apiClient.request<BillingPlanListResponse>("/super-admin/billing/plans");
}

export async function createSuperAdminBillingPlan(body: BillingPlanUpsertRequest): Promise<BillingPlanItem> {
  return apiClient.request<BillingPlanItem>("/super-admin/billing/plans", { method: "POST", body });
}

export async function patchSuperAdminBillingPlan(
  planId: string,
  body: Partial<BillingPlanUpsertRequest>,
): Promise<BillingPlanItem> {
  return apiClient.request<BillingPlanItem>(`/super-admin/billing/plans/${planId}`, {
    method: "PATCH",
    body,
  });
}

export async function getSuperAdminBillingSummary(): Promise<SuperAdminBillingSummary> {
  return apiClient.request<SuperAdminBillingSummary>("/super-admin/billing/summary");
}

export async function getSuperAdminBillingByOrganization(): Promise<SuperAdminBillingByOrganizationResponse> {
  return apiClient.request<SuperAdminBillingByOrganizationResponse>("/super-admin/billing/by-organization");
}

export async function getSuperAdminBillingAlerts(): Promise<BillingAlertListResponse> {
  return apiClient.request<BillingAlertListResponse>("/super-admin/billing/alerts");
}
