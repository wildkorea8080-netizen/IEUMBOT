export type WidgetPosition = "bottom-right" | "bottom-left";

export type SuperAdminWidgetItem = {
  id: string;
  chatbotId: string;
  organizationId: string;
  allowedDomains: string[];
  status: string;
  domain?: string | null;
  isActive: boolean;
  themeColor?: string | null;
  position: WidgetPosition;
  launcherLabel?: string | null;
  welcomeMessage?: string | null;
  installScript?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SuperAdminWidgetListResponse = {
  items: SuperAdminWidgetItem[];
};

export type SuperAdminWidgetCreateRequest = {
  chatbotId: string;
  allowedDomains: string[];
  themeColor?: string | null;
  launcherLabel?: string | null;
  welcomeMessage?: string | null;
  position?: WidgetPosition;
};

export type SuperAdminWidgetCreateResponse = {
  widgetId: string;
  chatbotId: string;
  organizationId: string;
  allowedDomains: string[];
  status: string;
  isActive: boolean;
  themeColor?: string | null;
  position: WidgetPosition;
  launcherLabel?: string | null;
  welcomeMessage?: string | null;
  installScript: string;
  createdAt: string;
  updatedAt: string;
};

export type SuperAdminWidgetDomainsPatchRequest = {
  allowedDomains: string[];
};

export type SuperAdminWidgetDetailResponse = {
  id: string;
  chatbotId: string;
  organizationId: string;
  allowedDomains: string[];
  status: string;
  isActive: boolean;
  themeColor?: string | null;
  position: WidgetPosition;
  launcherLabel?: string | null;
  welcomeMessage?: string | null;
  installScript?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SuperAdminWidgetUpdateRequest = {
  allowedDomains?: string[] | string;
  themeColor?: string | null;
  launcherLabel?: string | null;
  welcomeMessage?: string | null;
  position?: WidgetPosition;
  isActive?: boolean;
};
