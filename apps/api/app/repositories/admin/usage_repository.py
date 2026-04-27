from datetime import UTC, date, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import ChatMessage, ChatSession, ChatbotSetting, Contract, WidgetDeployment


def get_active_contract(
    db: Session,
    *,
    organization_id: str,
    today: date | None = None,
) -> Contract | None:
    current_date = today or datetime.now(UTC).date()
    stmt = (
        select(Contract)
        .where(
            Contract.organization_id == organization_id,
            Contract.status == "active",
            Contract.start_date <= current_date,
            func.coalesce(Contract.end_date, current_date) >= current_date,
        )
        .order_by(Contract.start_date.desc(), Contract.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def count_total_conversations(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(ChatSession.id)).where(ChatSession.organization_id == organization_id)
    return int(db.execute(stmt).scalar_one())


def count_monthly_conversations(
    db: Session,
    *,
    organization_id: str,
    month_start: datetime,
    next_month_start: datetime,
) -> int:
    stmt = select(func.count(ChatSession.id)).where(
        ChatSession.organization_id == organization_id,
        ChatSession.created_at >= month_start,
        ChatSession.created_at < next_month_start,
    )
    return int(db.execute(stmt).scalar_one())


def count_active_chatbots(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(ChatbotSetting.id)).where(
        ChatbotSetting.organization_id == organization_id,
        ChatbotSetting.deleted_at.is_(None),
        ChatbotSetting.status == "active",
    )
    return int(db.execute(stmt).scalar_one())


def count_active_widgets(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(WidgetDeployment.id)).where(
        WidgetDeployment.organization_id == organization_id,
        WidgetDeployment.status == "active",
    )
    return int(db.execute(stmt).scalar_one())


def count_chatbots_all(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(ChatbotSetting.id)).where(
        ChatbotSetting.organization_id == organization_id,
        ChatbotSetting.deleted_at.is_(None),
    )
    return int(db.execute(stmt).scalar_one())


def count_widgets_all(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(WidgetDeployment.id)).where(WidgetDeployment.organization_id == organization_id)
    return int(db.execute(stmt).scalar_one())


def get_daily_conversation_counts(
    db: Session,
    *,
    organization_id: str,
    from_date: datetime,
    to_date: datetime,
):
    stmt = (
        select(
            func.date_trunc("day", ChatSession.created_at).label("day"),
            func.count(ChatSession.id).label("conversation_count"),
        )
        .where(
            ChatSession.organization_id == organization_id,
            ChatSession.created_at >= from_date,
            ChatSession.created_at < to_date + timedelta(days=1),
        )
        .group_by("day")
        .order_by("day")
    )
    return list(db.execute(stmt).all())


def get_chatbot_conversation_counts(
    db: Session,
    *,
    organization_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
):
    stmt = select(
        ChatSession.chatbot_id,
        func.count(ChatSession.id).label("conversation_count"),
    ).where(ChatSession.organization_id == organization_id)
    if from_date is not None:
        stmt = stmt.where(ChatSession.created_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(ChatSession.created_at < to_date + timedelta(days=1))
    stmt = stmt.group_by(ChatSession.chatbot_id)
    return list(db.execute(stmt).all())


def get_chatbot_message_stats(
    db: Session,
    *,
    organization_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
):
    success_case = case((ChatMessage.result_type == "answered", 1), else_=0)
    fallback_case = case((ChatMessage.result_type.in_(["insufficient_evidence", "clarification"]), 1), else_=0)

    stmt = (
        select(
            ChatMessage.chatbot_id,
            func.avg(ChatMessage.latency_ms).label("average_response_time_ms"),
            func.count(ChatMessage.id).label("assistant_count"),
            func.sum(success_case).label("success_count"),
            func.sum(fallback_case).label("fallback_count"),
        )
        .where(
            ChatMessage.organization_id == organization_id,
            ChatMessage.role == "assistant",
            ChatMessage.is_test.is_(False),
        )
    )
    if from_date is not None:
        stmt = stmt.where(ChatMessage.created_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(ChatMessage.created_at < to_date + timedelta(days=1))
    stmt = stmt.group_by(ChatMessage.chatbot_id)
    return list(db.execute(stmt).all())


def list_org_chatbots(db: Session, *, organization_id: str):
    stmt = (
        select(ChatbotSetting)
        .where(
            ChatbotSetting.organization_id == organization_id,
            ChatbotSetting.deleted_at.is_(None),
        )
        .order_by(ChatbotSetting.name.asc())
    )
    return list(db.execute(stmt).scalars().all())

