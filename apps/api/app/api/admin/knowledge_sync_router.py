"""
지식 URL 자동 동기화 관리 API (Sprint 3-C).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.models.web_sources import WebSource
from app.schemas import ApiSchema
from app.services.admin.knowledge_sync_service import (
    SyncResult,
    calculate_next_sync,
    sync_web_source,
)
from app.services.admin.scope_service import require_institution_organization_id

router = APIRouter(tags=["admin-knowledge-sync"])


# ── 스키마 ────────────────────────────────────────────────────────────────────

class SyncSettingsRequest(ApiSchema):
    sync_enabled: bool
    sync_interval_days: int | None = None  # 1~180


class SyncResultResponse(ApiSchema):
    web_source_id: str
    changed: bool
    chunks_updated: int
    synced_at: str
    error: str | None


class SyncSettingsResponse(ApiSchema):
    web_source_id: str
    sync_enabled: bool
    sync_interval_days: int | None
    next_sync_at: str | None
    last_synced_at: str | None


def _to_sync_result(r: SyncResult) -> SyncResultResponse:
    return SyncResultResponse(
        web_source_id=r.web_source_id,
        changed=r.changed,
        chunks_updated=r.chunks_updated,
        synced_at=r.synced_at.isoformat(),
        error=r.error,
    )


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@router.post(
    "/knowledge/web-sources/{web_source_id}/sync",
    response_model=SyncResultResponse,
)
def sync_now(
    web_source_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SyncResultResponse:
    """즉시 동기화 트리거."""
    org_id = require_institution_organization_id(principal)

    row = db.execute(
        select(WebSource).where(
            WebSource.id == uuid.UUID(web_source_id),
            WebSource.organization_id == uuid.UUID(org_id),
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WEB_SOURCE_NOT_FOUND")

    result = sync_web_source(web_source_id, db)
    return _to_sync_result(result)


@router.patch(
    "/knowledge/web-sources/{web_source_id}/sync-settings",
    response_model=SyncSettingsResponse,
)
def update_sync_settings(
    web_source_id: str,
    body: SyncSettingsRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SyncSettingsResponse:
    """자동 동기화 ON/OFF + 주기 설정."""
    org_id = require_institution_organization_id(principal)

    row = db.execute(
        select(WebSource).where(
            WebSource.id == uuid.UUID(web_source_id),
            WebSource.organization_id == uuid.UUID(org_id),
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WEB_SOURCE_NOT_FOUND")

    row.sync_enabled = body.sync_enabled
    if body.sync_interval_days is not None:
        interval = max(1, min(180, body.sync_interval_days))
        row.sync_interval_days = interval
    if body.sync_enabled and row.sync_interval_days:
        row.next_sync_at = calculate_next_sync(row.sync_interval_days)
    elif not body.sync_enabled:
        row.next_sync_at = None

    db.commit()
    db.refresh(row)

    return SyncSettingsResponse(
        web_source_id=str(row.id),
        sync_enabled=row.sync_enabled,
        sync_interval_days=row.sync_interval_days,
        next_sync_at=row.next_sync_at.isoformat() if row.next_sync_at else None,
        last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
    )


@router.get(
    "/knowledge/web-sources/{web_source_id}/sync-settings",
    response_model=SyncSettingsResponse,
)
def get_sync_settings(
    web_source_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SyncSettingsResponse:
    """현재 자동 동기화 설정 조회."""
    org_id = require_institution_organization_id(principal)

    row = db.execute(
        select(WebSource).where(
            WebSource.id == uuid.UUID(web_source_id),
            WebSource.organization_id == uuid.UUID(org_id),
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WEB_SOURCE_NOT_FOUND")

    return SyncSettingsResponse(
        web_source_id=str(row.id),
        sync_enabled=row.sync_enabled,
        sync_interval_days=row.sync_interval_days,
        next_sync_at=row.next_sync_at.isoformat() if row.next_sync_at else None,
        last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
    )
