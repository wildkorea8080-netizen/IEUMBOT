from datetime import datetime, timezone

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.models import ChatMessage, ChatSession, ChatbotSetting, Citation, EscalationRule


def get_escalation_chatbot_in_scope(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> ChatbotSetting | None:
    stmt = select(ChatbotSetting).where(
        ChatbotSetting.organization_id == organization_id,
        ChatbotSetting.id == chatbot_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def list_escalation_rules(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> list[EscalationRule]:
    stmt = (
        select(EscalationRule)
        .where(
            EscalationRule.organization_id == organization_id,
            EscalationRule.chatbot_id == chatbot_id,
        )
        .order_by(EscalationRule.priority.asc(), EscalationRule.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def list_active_escalation_rules(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> list[EscalationRule]:
    stmt = (
        select(EscalationRule)
        .where(
            EscalationRule.organization_id == organization_id,
            EscalationRule.chatbot_id == chatbot_id,
            EscalationRule.is_active.is_(True),
        )
        .order_by(EscalationRule.priority.asc(), EscalationRule.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def get_escalation_rule(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    rule_id: str,
) -> EscalationRule | None:
    stmt = select(EscalationRule).where(
        EscalationRule.organization_id == organization_id,
        EscalationRule.chatbot_id == chatbot_id,
        EscalationRule.id == rule_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def create_escalation_rule(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    created_by_admin_id: str,
    trigger_type: str,
    trigger_condition: str | None,
    target_department: str,
    target_queue: str,
    fallback_message: str | None,
    category: str | None,
    priority: int,
    is_active: bool,
    metadata_json: dict | None,
) -> EscalationRule:
    row = EscalationRule(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        created_by_admin_id=created_by_admin_id,
        trigger_type=trigger_type,
        trigger_condition=trigger_condition,
        target_department=target_department,
        target_queue=target_queue,
        fallback_message=fallback_message,
        category=category,
        priority=priority,
        is_active=is_active,
        metadata_json=metadata_json or {},
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def delete_escalation_rule(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    rule_id: str,
) -> int:
    stmt = delete(EscalationRule).where(
        EscalationRule.organization_id == organization_id,
        EscalationRule.chatbot_id == chatbot_id,
        EscalationRule.id == rule_id,
    )
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def _safe_parse_utc(date_value: str | None) -> datetime | None:
    if not date_value:
        return None
    try:
        parsed = datetime.fromisoformat(date_value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def list_escalated_assistant_messages(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    reason: str | None,
    target_department: str | None,
    target_queue: str | None,
    outcome: str | None,
    llm_executed: bool | None,
    from_date: str | None,
    to_date: str | None,
    unresolved_only: bool,
    limit_count: int,
) -> list[ChatMessage]:
    stmt = select(ChatMessage).where(
        ChatMessage.organization_id == organization_id,
        ChatMessage.chatbot_id == chatbot_id,
        ChatMessage.role == "assistant",
        or_(
            ChatMessage.result_type == "escalate",
            ChatMessage.escalation_reason.is_not(None),
            ChatMessage.escalation_target_department.is_not(None),
            ChatMessage.escalation_target_queue.is_not(None),
        ),
    )

    if reason:
        stmt = stmt.where(ChatMessage.escalation_reason == reason)
    if target_department:
        stmt = stmt.where(ChatMessage.escalation_target_department == target_department)
    if target_queue:
        stmt = stmt.where(ChatMessage.escalation_target_queue == target_queue)
    if outcome:
        stmt = stmt.where(ChatMessage.result_type == outcome)
    if unresolved_only:
        stmt = stmt.where(ChatMessage.result_type.in_(["escalate", "restricted", "conflict", "insufficient_evidence"]))

    if llm_executed is True:
        stmt = stmt.where(ChatMessage.model_name.is_not(None))
    elif llm_executed is False:
        stmt = stmt.where(ChatMessage.model_name.is_(None))

    from_dt = _safe_parse_utc(from_date)
    to_dt = _safe_parse_utc(to_date)
    if from_dt:
        stmt = stmt.where(ChatMessage.created_at >= from_dt)
    if to_dt:
        stmt = stmt.where(ChatMessage.created_at <= to_dt)

    stmt = stmt.order_by(ChatMessage.created_at.desc()).limit(limit_count)
    return list(db.execute(stmt).scalars().all())


def get_latest_user_message_before(
    db: Session,
    *,
    session_id: str,
    created_at: datetime,
) -> ChatMessage | None:
    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.session_id == session_id,
            ChatMessage.role == "user",
            ChatMessage.created_at <= created_at,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def get_escalation_assistant_message_detail(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    message_id: str,
) -> ChatMessage | None:
    stmt = select(ChatMessage).where(
        ChatMessage.organization_id == organization_id,
        ChatMessage.chatbot_id == chatbot_id,
        ChatMessage.id == message_id,
        ChatMessage.role == "assistant",
    )
    return db.execute(stmt).scalar_one_or_none()


def list_session_messages(
    db: Session,
    *,
    session_id: str,
    limit_count: int = 20,
) -> list[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit_count)
    )
    rows = list(db.execute(stmt).scalars().all())
    rows.reverse()
    return rows


def list_citations_for_message(
    db: Session,
    *,
    chat_message_id: str,
) -> list[Citation]:
    stmt = (
        select(Citation)
        .where(Citation.chat_message_id == chat_message_id)
        .order_by(Citation.sort_order.asc())
    )
    return list(db.execute(stmt).scalars().all())


def get_chat_session(
    db: Session,
    *,
    session_id: str,
) -> ChatSession | None:
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    return db.execute(stmt).scalar_one_or_none()
