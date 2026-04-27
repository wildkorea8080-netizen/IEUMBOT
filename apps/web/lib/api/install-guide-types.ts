export type AdminInstallGuideItem = {
  chatbotId: string;
  chatbotName: string;
  widgetId?: string | null;
  widgetName?: string | null;
  status: string;
  isActive: boolean;
  allowedDomains: string[];
  themeColor?: string | null;
  position?: string | null;
  createdAt?: string | null;
  installScript?: string | null;
  hasWidget: boolean;
};

export type AdminInstallGuideResponse = {
  items: AdminInstallGuideItem[];
};
