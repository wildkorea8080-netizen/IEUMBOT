export type SuperAdminBlueprintItem = {
  blueprintId: string;
  organizationName: string;
  chatbotName: string;
  createdAt: string;
  lastUsedAt?: string | null;
  usageCount: number;
};

export type SuperAdminBlueprintListResponse = {
  items: SuperAdminBlueprintItem[];
  total: number;
};

export type SuperAdminBlueprintCreateRequest = {
  sourceOrganizationId: string;
};

export type SuperAdminBlueprintResponse = SuperAdminBlueprintItem & {
  sourceOrganizationId: string;
  sourceChatbotId: string;
};

export type SuperAdminBlueprintApplyRequest = {
  targetOrganizationId: string;
  overwriteExisting: boolean;
};

export type SuperAdminBlueprintApplyResponse = {
  blueprintId: string;
  targetOrganizationId: string;
  chatbotId: string;
  widgetId?: string | null;
  overwritten: boolean;
  appliedAt: string;
};
