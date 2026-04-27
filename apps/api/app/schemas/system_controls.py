from datetime import datetime
from typing import Literal

from app.schemas import ApiSchema

AnnouncementType = Literal["info", "warning", "critical"]
AnnouncementScope = Literal["global", "organization"]
MaintenanceMode = Literal["read_only", "block_all", "partial"]


class PublicAnnouncementItem(ApiSchema):
    title: str
    message: str
    type: AnnouncementType


class PublicAnnouncementsResponse(ApiSchema):
    announcements: list[PublicAnnouncementItem]


class PublicMaintenanceStatus(ApiSchema):
    is_active: bool
    mode: MaintenanceMode | None = None
    message: str | None = None


class PublicSystemStatusResponse(ApiSchema):
    maintenance: PublicMaintenanceStatus


class SuperAdminAnnouncementItem(ApiSchema):
    id: str
    title: str
    message: str
    type: AnnouncementType
    target_scope: AnnouncementScope
    target_organization_id: str | None = None
    target_organization_name: str | None = None
    is_active: bool
    start_at: datetime
    end_at: datetime | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class SuperAdminAnnouncementListResponse(ApiSchema):
    items: list[SuperAdminAnnouncementItem]


class SuperAdminAnnouncementCreateRequest(ApiSchema):
    title: str
    message: str
    type: AnnouncementType
    target_scope: AnnouncementScope
    target_organization_id: str | None = None
    is_active: bool = True
    start_at: datetime
    end_at: datetime | None = None


class SuperAdminAnnouncementUpdateRequest(ApiSchema):
    title: str | None = None
    message: str | None = None
    type: AnnouncementType | None = None
    target_scope: AnnouncementScope | None = None
    target_organization_id: str | None = None
    is_active: bool | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None


class SuperAdminMaintenanceItem(ApiSchema):
    id: str | None = None
    is_active: bool
    mode: MaintenanceMode
    message: str
    allowed_paths: list[str]
    allowed_roles: list[str] | None = None
    start_at: datetime
    end_at: datetime | None = None
    created_at: datetime | None = None


class SuperAdminMaintenanceUpsertRequest(ApiSchema):
    is_active: bool = True
    mode: MaintenanceMode
    message: str
    allowed_paths: list[str] = []
    allowed_roles: list[str] | None = None
    start_at: datetime
    end_at: datetime | None = None
