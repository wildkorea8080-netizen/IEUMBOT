export type PublicAnnouncementType = "info" | "warning" | "critical";
export type MaintenanceMode = "read_only" | "block_all" | "partial";

export type PublicAnnouncementItem = {
  title: string;
  message: string;
  type: PublicAnnouncementType;
};

export type PublicAnnouncementsResponse = {
  announcements: PublicAnnouncementItem[];
};

export type PublicSystemStatusResponse = {
  maintenance: {
    isActive: boolean;
    mode?: MaintenanceMode | null;
    message?: string | null;
  };
};

export type SuperAdminAnnouncementItem = {
  id: string;
  title: string;
  message: string;
  type: PublicAnnouncementType;
  targetScope: "global" | "organization";
  targetOrganizationId?: string | null;
  targetOrganizationName?: string | null;
  isActive: boolean;
  startAt: string;
  endAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SuperAdminAnnouncementListResponse = {
  items: SuperAdminAnnouncementItem[];
};

export type SuperAdminAnnouncementUpsertRequest = {
  title: string;
  message: string;
  type: PublicAnnouncementType;
  targetScope: "global" | "organization";
  targetOrganizationId?: string | null;
  isActive: boolean;
  startAt: string;
  endAt?: string | null;
};

export type SuperAdminAnnouncementPatchRequest = Partial<SuperAdminAnnouncementUpsertRequest>;

export type SuperAdminMaintenanceItem = {
  id?: string | null;
  isActive: boolean;
  mode: MaintenanceMode;
  message: string;
  allowedPaths: string[];
  allowedRoles?: string[] | null;
  startAt: string;
  endAt?: string | null;
  createdAt?: string | null;
};

export type SuperAdminMaintenanceUpsertRequest = {
  isActive: boolean;
  mode: MaintenanceMode;
  message: string;
  allowedPaths: string[];
  allowedRoles?: string[] | null;
  startAt: string;
  endAt?: string | null;
};
