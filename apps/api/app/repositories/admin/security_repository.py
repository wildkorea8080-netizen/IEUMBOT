from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models import AuditLog, ChatbotSetting, ChatMessage, ChatSession


def _assistant_events_parts(*, organization_id: str):
    assistant = aliased(ChatMessage)
    user_before = aliased(ChatMessage)
    audit = aliased(AuditLog)

    user_before_assistant_id_sq = (
        select(ChatMessage.id)
        .where(
            ChatMessage.session_id == assistant.session_id,
            ChatMessage.role == "user",
            ChatMessage.is_test.is_(False),
            ChatMessage.created_at <= assistant.created_at,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
        .scalar_subquery()
    )

    audit_error_sq = (
        select(AuditLog.id)
        .where(
            AuditLog.organization_id == organization_id,
            AuditLog.request_id == assistant.request_id,
            AuditLog.action == "chat.final_pipeline.executed",
            AuditLog.metadata_json["llmErrorCode"].astext.is_not(None),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(1)
        .scalar_subquery()
    )

    stmt = (
        select(assistant, user_before, ChatSession, ChatbotSetting, audit)
        .join(ChatSession, ChatSession.id == assistant.session_id)
        .join(ChatbotSetting, ChatbotSetting.id == assistant.chatbot_id)
        .outerjoin(user_before, user_before.id == user_before_assistant_id_sq)
        .outerjoin(audit, audit.id == audit_error_sq)
        .where(
            assistant.organization_id == organization_id,
            assistant.role == "assistant",
            assistant.is_test.is_(False),
            or_(
                assistant.result_type.in_(["restricted", "conflict", "insufficient_evidence", "clarification", "escalate"]),
                audit.id.is_not(None),
                assistant.status == "error",
            ),
        )
    )
    return stmt, assistant, user_before, audit


def list_security_events(
    db: Session,
    *,
    organization_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
    event_type: str | None,
    severity: str | None,
    repeated_dissatisfaction_only: bool,
    question_query: str | None,
    offset: int,
    limit: int,
):
    stmt, assistant, user_before, audit = _assistant_events_parts(organization_id=organization_id)

    if from_date is not None:
        stmt = stmt.where(assistant.created_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(assistant.created_at <= to_date)
    if severity:
        stmt = stmt.where(
            assistant.metadata_json["conversationTone"]["abusiveSeverity"].astext == severity.lower()
        )
    if repeated_dissatisfaction_only:
        stmt = stmt.where(
            assistant.metadata_json["conversationTone"]["repeatedUserDissatisfaction"].astext == "true"
        )
    if question_query:
        like_value = f"%{question_query}%"
        stmt = stmt.where(
            or_(
                user_before.content.ilike(like_value),
                user_before.content_masked.ilike(like_value),
            )
        )
    if event_type == "BLOCKED":
        stmt = stmt.where(
            audit.id.is_(None),
            assistant.result_type.in_(["restricted", "conflict"]),
        )
    elif event_type == "FALLBACK":
        stmt = stmt.where(
            audit.id.is_(None),
            assistant.result_type.in_(["insufficient_evidence", "clarification"]),
        )
    elif event_type == "ESCALATION":
        stmt = stmt.where(
            audit.id.is_(None),
            or_(assistant.result_type == "escalate", assistant.escalation_reason.is_not(None)),
        )
    elif event_type == "ERROR":
        stmt = stmt.where(or_(audit.id.is_not(None), assistant.status == "error"))

    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total_count = int(db.execute(count_stmt).scalar_one())
    stmt = stmt.order_by(assistant.created_at.desc()).offset(offset).limit(limit)
    return list(db.execute(stmt).all()), total_count


def count_security_events(
    db: Session,
    *,
    organization_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
):
    stmt, assistant, _, _ = _assistant_events_parts(organization_id=organization_id)
    if from_date is not None:
        stmt = stmt.where(assistant.created_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(assistant.created_at <= to_date)
    rows = list(db.execute(stmt).all())
    counts = {"BLOCKED": 0, "FALLBACK": 0, "ESCALATION": 0, "ERROR": 0}
    for assistant_row, _, _, _, audit_row in rows:
        if audit_row is not None or assistant_row.status == "error":
            counts["ERROR"] += 1
        elif assistant_row.result_type in {"restricted", "conflict"}:
            counts["BLOCKED"] += 1
        elif assistant_row.result_type in {"insufficient_evidence", "clarification"}:
            counts["FALLBACK"] += 1
        elif assistant_row.result_type == "escalate" or assistant_row.escalation_reason:
            counts["ESCALATION"] += 1
    return counts


def get_security_event_detail_row(
    db: Session,
    *,
    organization_id: str,
    event_id: str,
):
    stmt, assistant, _, _ = _assistant_events_parts(organization_id=organization_id)
    stmt = stmt.where(assistant.id == event_id)
    return db.execute(stmt).first()
