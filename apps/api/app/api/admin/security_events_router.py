import csv
import io
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.models.security_event import SecurityEvent
from app.schemas import ApiSchema
from app.services.admin.scope_service import require_institution_organization_id

router = APIRouter(tags=["admin-security-events"])


# ── 스키마 ────────────────────────────────────────────────────────────────────

class SecurityEventItem(ApiSchema):
    id: str
    chatbot_id: str
    session_id: str | None
    event_type: str
    severity: str
    question_masked: str
    detected_patterns: list[str]
    ai_response: str | None
    created_at: str


class SecurityEventSummary(ApiSchema):
    total: int
    privacy_exposure: int
    abnormal_access: int
    inappropriate: int
    negative_emotion: int


class SecurityEventListResponse(ApiSchema):
    items: list[SecurityEventItem]
    total: int
    summary: SecurityEventSummary


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _to_item(row: SecurityEvent) -> SecurityEventItem:
    return SecurityEventItem(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        session_id=row.session_id,
        event_type=row.event_type,
        severity=row.severity,
        question_masked=row.question_masked,
        detected_patterns=list(row.detected_patterns or []),
        ai_response=row.ai_response,
        created_at=row.created_at.isoformat(),
    )


def _build_conditions(
    organization_id: str,
    chatbot_id: str | None,
    event_type: str | None,
    severity: str | None,
    from_date: str | None,
    to_date: str | None,
) -> list[Any]:
    conds: list[Any] = [SecurityEvent.organization_id == uuid.UUID(organization_id)]
    if chatbot_id:
        try:
            conds.append(SecurityEvent.chatbot_id == uuid.UUID(chatbot_id))
        except ValueError:
            pass
    if event_type:
        conds.append(SecurityEvent.event_type == event_type)
    if severity:
        conds.append(SecurityEvent.severity == severity)
    if from_date:
        try:
            conds.append(SecurityEvent.created_at >= datetime.fromisoformat(from_date))
        except ValueError:
            pass
    if to_date:
        try:
            conds.append(SecurityEvent.created_at <= datetime.fromisoformat(to_date))
        except ValueError:
            pass
    return conds


def _compute_summary(db: Session, conditions: list[Any]) -> SecurityEventSummary:
    def _count(extra: Any) -> int:
        return db.execute(
            select(func.count(SecurityEvent.id)).where(and_(*conditions, extra))
        ).scalar_one()

    return SecurityEventSummary(
        total=db.execute(select(func.count(SecurityEvent.id)).where(and_(*conditions))).scalar_one(),
        privacy_exposure=_count(SecurityEvent.event_type == "privacy_exposure"),
        abnormal_access=_count(SecurityEvent.event_type == "abnormal_access"),
        inappropriate=_count(SecurityEvent.event_type == "inappropriate"),
        negative_emotion=_count(SecurityEvent.event_type == "negative_emotion"),
    )


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@router.get("/security/events", response_model=SecurityEventListResponse)
def list_security_events(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    event_type: str | None = Query(default=None, alias="eventType"),
    severity: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SecurityEventListResponse:
    org_id = require_institution_organization_id(principal)
    conditions = _build_conditions(org_id, chatbot_id, event_type, severity, from_date, to_date)

    rows = db.execute(
        select(SecurityEvent)
        .where(and_(*conditions))
        .order_by(desc(SecurityEvent.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    summary = _compute_summary(db, conditions)

    return SecurityEventListResponse(
        items=[_to_item(r) for r in rows],
        total=summary.total,
        summary=summary,
    )


@router.get("/security/events/export")
def export_security_events_csv(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    event_type: str | None = Query(default=None, alias="eventType"),
    severity: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    org_id = require_institution_organization_id(principal)
    conditions = _build_conditions(org_id, chatbot_id, event_type, severity, from_date, to_date)

    rows = db.execute(
        select(SecurityEvent)
        .where(and_(*conditions))
        .order_by(desc(SecurityEvent.created_at))
        .limit(5000)
    ).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["발생일시", "이벤트 유형", "심각도", "질문(마스킹)", "감지 패턴", "AI 응답", "세션ID"])
    for r in rows:
        writer.writerow([
            r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            r.event_type,
            r.severity,
            r.question_masked,
            ", ".join(r.detected_patterns or []),
            r.ai_response or "",
            r.session_id or "",
        ])

    filename = f"security_events_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
