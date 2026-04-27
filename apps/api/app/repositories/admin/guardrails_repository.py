import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import ChatbotSetting, GuardrailRule


def get_guardrail_chatbot_in_scope(
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


def list_guardrail_rules(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> list[GuardrailRule]:
    stmt = (
        select(GuardrailRule)
        .where(
            GuardrailRule.organization_id == organization_id,
            GuardrailRule.chatbot_id == chatbot_id,
        )
        .order_by(GuardrailRule.priority.asc(), GuardrailRule.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def list_active_guardrail_rules(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> list[GuardrailRule]:
    stmt = (
        select(GuardrailRule)
        .where(
            GuardrailRule.organization_id == organization_id,
            GuardrailRule.chatbot_id == chatbot_id,
            GuardrailRule.is_active.is_(True),
        )
        .order_by(GuardrailRule.priority.asc(), GuardrailRule.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def get_guardrail_rule(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    rule_id: str,
) -> GuardrailRule | None:
    stmt = select(GuardrailRule).where(
        GuardrailRule.organization_id == organization_id,
        GuardrailRule.chatbot_id == chatbot_id,
        GuardrailRule.id == rule_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def create_guardrail_rule(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    created_by_admin_id: str,
    rule_type: str,
    target_category: str | None,
    match_mode: str,
    match_value: str | None,
    action_type: str,
    severity: str,
    fallback_message: str | None,
    escalation_message: str | None,
    priority: int,
    is_active: bool,
    metadata_json: dict | None,
) -> GuardrailRule:
    row = GuardrailRule(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        created_by_admin_id=created_by_admin_id,
        rule_type=rule_type,
        target_category=target_category,
        match_mode=match_mode,
        match_value=match_value,
        action_type=action_type,
        severity=severity,
        fallback_message=fallback_message,
        escalation_message=escalation_message,
        priority=priority,
        is_active=is_active,
        metadata_json=metadata_json or {},
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def delete_guardrail_rule(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    rule_id: str,
) -> int:
    stmt = delete(GuardrailRule).where(
        GuardrailRule.organization_id == organization_id,
        GuardrailRule.chatbot_id == chatbot_id,
        GuardrailRule.id == rule_id,
    )
    result = db.execute(stmt)
    return int(result.rowcount or 0)
