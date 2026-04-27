export type SuperAdminWidgetItem = {
  id: string;
  chatbotId: string;
  organizationId: string;
  allowedDomains: string[];
  status: string;
  domain?: string | null;
  isActive: boolean;
  installScript?: string | null;
  createdAt: string;
};

export type SuperAdminWidgetListResponse = {
  items: SuperAdminWidgetItem[];
};

export type SuperAdminWidgetCreateRequest = {
  chatbotId: string;
  allowedDomains: string[];
};

export type SuperAdminWidgetCreateResponse = {
  widgetId: string;
  chatbotId: string;
  organizationId: string;
  allowedDomains: string[];
  status: string;
  isActive: boolean;
  installScript: string;
  createdAt: string;
};

export type SuperAdminWidgetDomainsPatchRequest = {
  allowedDomains: string[];
};

export type SuperAdminWidgetDetailResponse = {
  id: string;
  chatbotId: string;
  organizationId: string;
  allowedDomains: string[];
  isActive: boolean;
  installScript?: string | null;
  createdAt: string;
};
