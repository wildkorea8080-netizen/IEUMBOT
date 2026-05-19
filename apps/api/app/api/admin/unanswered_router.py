import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.models.unanswered_log import UnansweredLog
from app.schemas import ApiSchema
from app.services.admin.scope_service import require_institution_organization_id

router = APIRouter(tags=["admin-unanswered"])


# ── 스키마 ────────────────────────────────────────────────────────────────────

class UnansweredLogItem(ApiSchema):
    id: str
    chatbot_id: str
    question: str
    search_score: float | None
    outcome: str
    session_id: str | None
    status: str
    resolved_at: str | None
    created_at: str


class UnansweredLogListResponse(ApiSchema):
    items: list[UnansweredLogItem]
    total: int
    page: int
    page_size: int


class UnansweredLogUpdateRequest(ApiSchema):
    status: Literal["pending", "resolved", "ignored"]


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _to_item(row: UnansweredLog) -> UnansweredLogItem:
    return UnansweredLogItem(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        question=row.question,
        search_score=row.search_score,
        outcome=row.outcome,
        session_id=row.session_id,
        status=row.status,
        resolved_at=row.resolved_at.isoformat() if row.resolved_at else None,
        created_at=row.created_at.isoformat(),
    )


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@router.get("/unanswered", response_model=UnansweredLogListResponse)
def list_unanswered(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    status: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> UnansweredLogListResponse:
    organization_id = require_institution_organization_id(principal)

    conditions = [UnansweredLog.organization_id == uuid.UUID(organization_id)]

    if chatbot_id:
        try:
            conditions.append(UnansweredLog.chatbot_id == uuid.UUID(chatbot_id))
        except ValueError:
            pass

    if status:
        conditions.append(UnansweredLog.status == status)

    if from_date:
        try:
            conditions.append(UnansweredLog.created_at >= datetime.fromisoformat(from_date))
        except ValueError:
            pass

    if to_date:
        try:
            conditions.append(UnansweredLog.created_at <= datetime.fromisoformat(to_date))
        except ValueError:
            pass

    total = db.execute(
        select(func.count(UnansweredLog.id)).where(and_(*conditions))
    ).scalar_one()

    rows = db.execute(
        select(UnansweredLog)
        .where(and_(*conditions))
        .order_by(desc(UnansweredLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    return UnansweredLogListResponse(
        items=[_to_item(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/unanswered/{log_id}", response_model=UnansweredLogItem)
def update_unanswered(
    log_id: str,
    body: UnansweredLogUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> UnansweredLogItem:
    organization_id = require_institution_organization_id(principal)

    row = db.execute(
        select(UnansweredLog).where(
            UnansweredLog.id == uuid.UUID(log_id),
            UnansweredLog.organization_id == uuid.UUID(organization_id),
        )
    ).scalar_one_or_none()

    if row is None:
        from fastapi import HTTPException, status as http_status  # noqa: PLC0415
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="UNANSWERED_LOG_NOT_FOUND")

    row.status = body.status
    if body.status == "resolved":
        row.resolved_at = datetime.now(UTC)
    else:
        row.resolved_at = None

    db.commit()
    db.refresh(row)
    return _to_item(row)
