import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import Organization, SystemAnnouncement, SystemMaintenance
from app.repositories.logs.audit_log_repository import create_audit_log
from app.repositories.system_controls_repository import (
    get_announcement_by_id,
    get_current_maintenance,
    get_latest_maintenance,
    list_active_announcements,
    list_announcements,
)
from app.schemas.system_controls import (
    PublicAnnouncementItem,
    PublicAnnouncementsResponse,
    PublicMaintenanceStatus,
    PublicSystemStatusResponse,
    SuperAdminAnnouncementCreateRequest,
    SuperAdminAnnouncementItem,
    SuperAdminAnnouncementListResponse,
    SuperAdminAnnouncementUpdateRequest,
    SuperAdminMaintenanceItem,
    SuperAdminMaintenanceUpsertRequest,
)
from app.services.notification_service import notify_maintenance_changed

ANNOUNCEMENT_TYPES = {"info", "warning", "critical"}
ANNOUNCEMENT_SCOPES = {"global", "organization"}
MAINTENANCE_MODES = {"read_only", "block_all", "partial"}


def _resolve_audit_organization_id(db: Session) -> str:
    row = db.execute(select(Organization.id).order_by(Organization.created_at.asc()).limit(1)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ORGANIZATION_REQUIRED_FOR_AUDIT")
    return str(row)


def _audit(
    db: Session,
    *,
    principal: AdminPrincipal,
    action: str,
    target_type: str,
    target_id: str | None,
    metadata_json: dict,
) -> None:
    create_audit_log(
        db,
        organization_id=_resolve_audit_organization_id(db),
        admin_id=principal.admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        result="success",
        request_id=None,
        metadata_json=metadata_json,
    )


def _validate_uuid_or_404(value: str | None, detail: str) -> str | None:
    if value is None:
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _normalize_text(value: str, detail: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)
    return normalized


def _validate_announcement_fields(
    db: Session,
    *,
    type_value: str | None,
    target_scope: str | None,
    target_organization_id: str | None,
    start_at: datetime | None,
    end_at: datetime | None,
) -> str | None:
    if type_value is not None and type_value not in ANNOUNCEMENT_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ANNOUNCEMENT_TYPE")
    if target_scope is not None and target_scope not in ANNOUNCEMENT_SCOPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ANNOUNCEMENT_SCOPE")
    normalized_target_organization_id = _validate_uuid_or_404(target_organization_id, "ORGANIZATION_NOT_FOUND")
    if target_scope == "organization" and not normalized_target_organization_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="TARGET_ORGANIZATION_REQUIRED")
    if normalized_target_organization_id:
        exists = db.execute(
            select(Organization.id).where(Organization.id == normalized_target_organization_id)
        ).scalar_one_or_none()
        if exists is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")
    if target_scope == "global":
        normalized_target_organization_id = None
    if start_at and end_at and start_at > end_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ACTIVE_WINDOW")
    return normalized_target_organization_id


def _to_announcement_item(row: SystemAnnouncement, organization_name: str | None = None) -> SuperAdminAnnouncementItem:
    return SuperAdminAnnouncementItem(
        id=str(row.id),
        title=row.title,
        message=row.message,
        type=row.type,  # type: ignore[arg-type]
        target_scope=row.target_scope,  # type: ignore[arg-type]
        target_organization_id=(str(row.target_organization_id) if row.target_organization_id else None),
        target_organization_name=organization_name,
        is_active=row.is_active,
        start_at=row.start_at,
        end_at=row.end_at,
        created_by=(str(row.created_by) if row.created_by else None),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_public_announcements_service(
    db: Session,
    *,
    organization_id: str | None,
) -> PublicAnnouncementsResponse:
    organization_id = _validate_uuid_or_404(organization_id, "ORGANIZATION_NOT_FOUND")
    rows = list_active_announcements(db, organization_id=organization_id)
    return PublicAnnouncementsResponse(
        announcements=[
            PublicAnnouncementItem(title=row.title, message=row.message, type=row.type)  # type: ignore[arg-type]
            for row in rows
        ]
    )


def get_public_system_status_service(db: Session) -> PublicSystemStatusResponse:
    maintenance = get_current_maintenance(db)
    if maintenance is None:
        return PublicSystemStatusResponse(maintenance=PublicMaintenanceStatus(is_active=False))
    return PublicSystemStatusResponse(
        maintenance=PublicMaintenanceStatus(
            is_active=True,
            mode=maintenance.mode,  # type: ignore[arg-type]
            message=maintenance.message,
        )
    )


def list_super_admin_announcements_service(db: Session, *, principal: AdminPrincipal) -> SuperAdminAnnouncementListResponse:
    _ = principal
    rows = list_announcements(db)
    return SuperAdminAnnouncementListResponse(
        items=[_to_announcement_item(row, organization_name) for row, organization_name in rows]
    )


def create_announcement_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: SuperAdminAnnouncementCreateRequest,
) -> SuperAdminAnnouncementItem:
    target_organization_id = _validate_announcement_fields(
        db,
        type_value=body.type,
        target_scope=body.target_scope,
        target_organization_id=body.target_organization_id,
        start_at=body.start_at,
        end_at=body.end_at,
    )
    row = SystemAnnouncement(
        title=_normalize_text(body.title, "ANNOUNCEMENT_TITLE_REQUIRED"),
        message=_normalize_text(body.message, "ANNOUNCEMENT_MESSAGE_REQUIRED"),
        type=body.type,
        target_scope=body.target_scope,
        target_organization_id=target_organization_id,
        is_active=body.is_active,
        start_at=body.start_at,
        end_at=body.end_at,
        created_by=principal.admin_id,
    )
    db.add(row)
    db.flush()
    _audit(
        db,
        principal=principal,
        action="super_admin.announcement.create",
        target_type="system_announcement",
        target_id=str(row.id),
        metadata_json={"type": row.type, "targetScope": row.target_scope, "isActive": row.is_active},
    )
    notify_maintenance_changed(db, is_active=row.is_active, mode=row.mode, message=row.message)
    db.commit()
    db.refresh(row)
    return _to_announcement_item(row)


def update_announcement_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    announcement_id: str,
    body: SuperAdminAnnouncementUpdateRequest,
) -> SuperAdminAnnouncementItem:
    announcement_id = _validate_uuid_or_404(announcement_id, "ANNOUNCEMENT_NOT_FOUND")
    row = get_announcement_by_id(db, announcement_id=announcement_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ANNOUNCEMENT_NOT_FOUND")

    next_type = body.type if body.type is not None else row.type
    next_scope = body.target_scope if body.target_scope is not None else row.target_scope
    next_target_organization_id = (
        body.target_organization_id if body.target_scope is not None or body.target_organization_id is not None else (
            str(row.target_organization_id) if row.target_organization_id else None
        )
    )
    next_start_at = body.start_at if body.start_at is not None else row.start_at
    next_end_at = body.end_at if "end_at" in body.model_fields_set else row.end_at
    normalized_target_organization_id = _validate_announcement_fields(
        db,
        type_value=next_type,
        target_scope=next_scope,
        target_organization_id=next_target_organization_id,
        start_at=next_start_at,
        end_at=next_end_at,
    )

    changed_fields: list[str] = []
    if body.title is not None:
        row.title = _normalize_text(body.title, "ANNOUNCEMENT_TITLE_REQUIRED")
        changed_fields.append("title")
    if body.message is not None:
        row.message = _normalize_text(body.message, "ANNOUNCEMENT_MESSAGE_REQUIRED")
        changed_fields.append("message")
    if body.type is not None:
        row.type = body.type
        changed_fields.append("type")
    if body.target_scope is not None or body.target_organization_id is not None:
        row.target_scope = next_scope
        row.target_organization_id = normalized_target_organization_id
        changed_fields.append("target_scope")
    if body.is_active is not None:
        row.is_active = body.is_active
        changed_fields.append("is_active")
    if body.start_at is not None:
        row.start_at = body.start_at
        changed_fields.append("start_at")
    if "end_at" in body.model_fields_set:
        row.end_at = body.end_at
        changed_fields.append("end_at")

    _audit(
        db,
        principal=principal,
        action="super_admin.announcement.update",
        target_type="system_announcement",
        target_id=str(row.id),
        metadata_json={"changedFields": changed_fields},
    )
    if "is_active" in changed_fields:
        _audit(
            db,
            principal=principal,
            action="super_admin.announcement.activate",
            target_type="system_announcement",
            target_id=str(row.id),
            metadata_json={"isActive": row.is_active},
        )
    db.commit()
    db.refresh(row)
    organization_name = None
    if row.target_organization_id:
        organization_name = db.execute(
            select(Organization.name).where(Organization.id == row.target_organization_id)
        ).scalar_one_or_none()
    return _to_announcement_item(row, organization_name)


def get_super_admin_maintenance_service(db: Session, *, principal: AdminPrincipal) -> SuperAdminMaintenanceItem:
    _ = principal
    row = get_latest_maintenance(db)
    if row is None:
        return SuperAdminMaintenanceItem(
            is_active=False,
            mode="read_only",
            message="",
            allowed_paths=[],
            allowed_roles=None,
            start_at=datetime.now(UTC),
            end_at=None,
            created_at=None,
        )
    return SuperAdminMaintenanceItem(
        id=str(row.id),
        is_active=row.is_active,
        mode=row.mode,  # type: ignore[arg-type]
        message=row.message,
        allowed_paths=list(row.allowed_paths or []),
        allowed_roles=list(row.allowed_roles) if row.allowed_roles else None,
        start_at=row.start_at,
        end_at=row.end_at,
        created_at=row.created_at,
    )


def upsert_maintenance_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: SuperAdminMaintenanceUpsertRequest,
) -> SuperAdminMaintenanceItem:
    if body.mode not in MAINTENANCE_MODES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_MAINTENANCE_MODE")
    if body.end_at is not None and body.start_at > body.end_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ACTIVE_WINDOW")
    allowed_paths = [path.strip() for path in body.allowed_paths if path.strip()]
    if body.mode == "partial" and not allowed_paths:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ALLOWED_PATHS_REQUIRED")

    row = get_latest_maintenance(db)
    if row is None:
        row = SystemMaintenance(
            is_active=body.is_active,
            mode=body.mode,
            message=_normalize_text(body.message, "MAINTENANCE_MESSAGE_REQUIRED"),
            allowed_paths=allowed_paths,
            allowed_roles=body.allowed_roles,
            start_at=body.start_at,
            end_at=body.end_at,
            created_at=datetime.now(UTC),
        )
        db.add(row)
        db.flush()
    else:
        row.is_active = body.is_active
        row.mode = body.mode
        row.message = _normalize_text(body.message, "MAINTENANCE_MESSAGE_REQUIRED")
        row.allowed_paths = allowed_paths
        row.allowed_roles = body.allowed_roles
        row.start_at = body.start_at
        row.end_at = body.end_at

    _audit(
        db,
        principal=principal,
        action="super_admin.maintenance.enable" if body.is_active else "super_admin.maintenance.disable",
        target_type="system_maintenance",
        target_id=str(row.id),
        metadata_json={"mode": row.mode, "allowedPaths": row.allowed_paths},
    )
    notify_maintenance_changed(db, is_active=False, mode=row.mode, message=row.message)
    db.commit()
    db.refresh(row)
    return SuperAdminMaintenanceItem(
        id=str(row.id),
        is_active=row.is_active,
        mode=row.mode,  # type: ignore[arg-type]
        message=row.message,
        allowed_paths=list(row.allowed_paths or []),
        allowed_roles=list(row.allowed_roles) if row.allowed_roles else None,
        start_at=row.start_at,
        end_at=row.end_at,
        created_at=row.created_at,
    )


def disable_maintenance_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> SuperAdminMaintenanceItem:
    row = get_latest_maintenance(db)
    if row is None:
        return SuperAdminMaintenanceItem(
            is_active=False,
            mode="read_only",
            message="",
            allowed_paths=[],
            allowed_roles=None,
            start_at=datetime.now(UTC),
            end_at=None,
            created_at=None,
        )
    row.is_active = False
    _audit(
        db,
        principal=principal,
        action="super_admin.maintenance.disable",
        target_type="system_maintenance",
        target_id=str(row.id),
        metadata_json={"mode": row.mode},
    )
    db.commit()
    db.refresh(row)
    return SuperAdminMaintenanceItem(
        id=str(row.id),
        is_active=row.is_active,
        mode=row.mode,  # type: ignore[arg-type]
        message=row.message,
        allowed_paths=list(row.allowed_paths or []),
        allowed_roles=list(row.allowed_roles) if row.allowed_roles else None,
        start_at=row.start_at,
        end_at=row.end_at,
        created_at=row.created_at,
    )
