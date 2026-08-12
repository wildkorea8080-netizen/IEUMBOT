import csv
import io
import uuid
from datetime import datetime, timedelta, timezone
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


# 화면의 기간 버튼은 한국 날짜를 뜻한다. UTC로 자르면 한국 오전 0~9시에
# '오늘'이 어제를 가리켜, 관리자가 아침에 보면 방금 난 사건이 안 보인다.
_KST = timezone(timedelta(hours=9))


def parse_event_day_range(
    from_date: str | None, to_date: str | None
) -> tuple[datetime | None, datetime | None]:
    """YYYY-MM-DD 두 개를 [시작, 끝) 구간으로 바꾼다. 경계는 한국시간 기준.

    끝은 종료일 '다음 날' 0시다. 종료일 0시로 두면 그날 하루가 통째로 빠진다.
    형식이 잘못된 값은 화면 전체를 죽이지 않도록 무시한다.
    """

    def _day_start(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value).replace(tzinfo=_KST)
        except ValueError:
            return None

    start_at = _day_start(from_date)
    end_day = _day_start(to_date)
    end_at = end_day + timedelta(days=1) if end_day is not None else None
    return start_at, end_at


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
    start_at, end_at = parse_event_day_range(from_date, to_date)
    if start_at is not None:
        conds.append(SecurityEvent.created_at >= start_at)
    if end_at is not None:
        # 종료 경계는 다음 날 0시 '미만'이다. 예전처럼 종료일 0시로 <= 비교하면
        # 그날 발생한 이벤트가 전부 빠진다 — '오늘'이 항상 0건이던 원인.
        conds.append(SecurityEvent.created_at < end_at)
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
