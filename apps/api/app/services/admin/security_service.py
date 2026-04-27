from datetime import UTC, datetime, time
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import ChatMessage
from app.repositories.admin.security_repository import (
    count_security_events,
    get_security_event_detail_row,
    list_security_events,
)
from app.schemas.security import (
    AdminSecurityEventDetailResponse,
    AdminSecurityEventItem,
    AdminSecurityEventsResponse,
    AdminSecuritySummaryResponse,
)
from app.services.admin.scope_service import require_institution_organization_id


def _parse_datetime_range(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        date_value = datetime.fromisoformat(value).date()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="INVALID_DATE_FORMAT",
        ) from exc
    return datetime.combine(date_value, time.max if end_of_day else time.min, tzinfo=UTC)


def _mask_content(message: ChatMessage | None) -> str | None:
    if message is None:
        return None
    return message.content_masked or message.content


def _event_meta(message: ChatMessage, *, has_error: bool) -> tuple[str, str, str]:
    outcome = (message.result_type or "").lower()
    if has_error or message.status == "error":
        return "ERROR", "ERROR", "시스템 오류"
    if outcome in {"restricted", "conflict"}:
        reason = message.escalation_reason or "정책 위반"
        if outcome == "conflict":
            reason = "근거 충돌"
        return "BLOCKED", "차단", reason
    if outcome in {"insufficient_evidence", "clarification"}:
        return "FALLBACK", "fallback", message.escalation_reason or "근거 부족"
    if outcome == "escalate" or message.escalation_reason:
        return "ESCALATION", "이관", message.escalation_reason or "상담원 이관"
    return "ERROR", "ERROR", "응답 실패"


def _fallback_message(message: ChatMessage, event_type: str) -> str | None:
    if event_type in {"BLOCKED", "FALLBACK", "ESCALATION", "ERROR"}:
        return _mask_content(message)
    return None


def get_security_summary_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> AdminSecuritySummaryResponse:
    organization_id = require_institution_organization_id(principal)
    today = datetime.now(UTC).date()
    counts = count_security_events(
        db,
        organization_id=organization_id,
        from_date=datetime.combine(today, time.min, tzinfo=UTC),
        to_date=datetime.combine(today, time.max, tzinfo=UTC),
    )
    return AdminSecuritySummaryResponse(
        blocked_today=counts["BLOCKED"],
        fallback_today=counts["FALLBACK"],
        escalation_today=counts["ESCALATION"],
        error_today=counts["ERROR"],
    )


def list_security_events_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    from_date_raw: str | None,
    to_date_raw: str | None,
    event_type: str | None,
    question_query: str | None,
    page: int,
    page_size: int,
) -> AdminSecurityEventsResponse:
    organization_id = require_institution_organization_id(principal)
    rows, total_count = list_security_events(
        db,
        organization_id=organization_id,
        from_date=_parse_datetime_range(from_date_raw),
        to_date=_parse_datetime_range(to_date_raw, end_of_day=True),
        event_type=(event_type.strip().upper() if event_type else None),
        question_query=(question_query.strip() if question_query else None),
        offset=(page - 1) * page_size,
        limit=page_size,
    )

    items: list[AdminSecurityEventItem] = []
    for assistant, latest_user, _, chatbot, audit in rows:
        event_key, event_label, reason_label = _event_meta(assistant, has_error=(audit is not None))
        items.append(
            AdminSecurityEventItem(
                event_id=str(assistant.id),
                session_id=str(assistant.session_id),
                chatbot_id=str(assistant.chatbot_id),
                chatbot_name=chatbot.name,
                time=assistant.created_at.isoformat(),
                question_preview=_mask_content(latest_user),
                event_type=event_key,
                event_label=event_label,
                reason_label=reason_label,
                response_time_ms=assistant.latency_ms,
            )
        )

    return AdminSecurityEventsResponse(
        items=items,
        total_count=total_count,
        page=page,
        page_size=page_size,
    )


def get_security_event_detail_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    event_id: str,
) -> AdminSecurityEventDetailResponse:
    organization_id = require_institution_organization_id(principal)
    try:
        UUID(event_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SECURITY_EVENT_NOT_FOUND") from exc

    row = get_security_event_detail_row(db, organization_id=organization_id, event_id=event_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SECURITY_EVENT_NOT_FOUND")

    assistant, latest_user, _, chatbot, audit = row
    event_key, event_label, reason_label = _event_meta(assistant, has_error=(audit is not None))
    return AdminSecurityEventDetailResponse(
        event_id=str(assistant.id),
        session_id=str(assistant.session_id),
        chatbot_id=str(assistant.chatbot_id),
        chatbot_name=chatbot.name,
        user_question=_mask_content(latest_user),
        assistant_answer=_mask_content(assistant),
        event_type=event_key,
        event_label=event_label,
        status=assistant.status,
        time=assistant.created_at.isoformat(),
        reason_label=reason_label,
        fallback_message=_fallback_message(assistant, event_key),
        escalated=bool(assistant.result_type == "escalate" or assistant.escalation_reason),
        response_time_ms=assistant.latency_ms,
        advanced_analysis_url=f"/admin/conversation-analysis?sessionId={assistant.session_id}",
    )
