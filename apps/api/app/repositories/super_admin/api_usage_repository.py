from datetime import datetime

from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session

from app.models import ChatbotSetting, LLMUsageLog, Organization


def list_usage_by_organization(db: Session, *, from_date: datetime | None = None):
    stmt = (
        select(
            LLMUsageLog.organization_id,
            Organization.name.label("organization_name"),
            func.count(LLMUsageLog.id).label("total_calls"),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(LLMUsageLog.estimated_cost), 0).label("estimated_cost"),
            func.coalesce(func.sum(case((LLMUsageLog.success.is_(False), 1), else_=0)), 0).label("failed_calls"),
        )
        .join(Organization, Organization.id == LLMUsageLog.organization_id)
        .group_by(LLMUsageLog.organization_id, Organization.name)
        .order_by(desc("total_tokens"))
    )
    if from_date is not None:
        stmt = stmt.where(LLMUsageLog.created_at >= from_date)
    return list(db.execute(stmt).all())


def list_usage_by_chatbot(db: Session, *, from_date: datetime | None = None):
    stmt = (
        select(
            LLMUsageLog.chatbot_id,
            ChatbotSetting.name.label("chatbot_name"),
            LLMUsageLog.organization_id,
            func.count(LLMUsageLog.id).label("total_calls"),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(LLMUsageLog.estimated_cost), 0).label("estimated_cost"),
            func.coalesce(func.sum(case((LLMUsageLog.success.is_(False), 1), else_=0)), 0).label("failed_calls"),
        )
        .join(ChatbotSetting, ChatbotSetting.id == LLMUsageLog.chatbot_id)
        .group_by(LLMUsageLog.chatbot_id, ChatbotSetting.name, LLMUsageLog.organization_id)
        .order_by(desc("total_tokens"))
    )
    if from_date is not None:
        stmt = stmt.where(LLMUsageLog.created_at >= from_date)
    return list(db.execute(stmt).all())


def list_recent_api_errors(db: Session, *, from_date: datetime | None = None, organization_id: str | None = None, limit: int = 20):
    stmt = (
        select(LLMUsageLog, Organization.name.label("organization_name"), ChatbotSetting.name.label("chatbot_name"))
        .join(Organization, Organization.id == LLMUsageLog.organization_id)
        .join(ChatbotSetting, ChatbotSetting.id == LLMUsageLog.chatbot_id)
        .where(LLMUsageLog.success.is_(False))
        .order_by(LLMUsageLog.created_at.desc())
        .limit(limit)
    )
    if from_date is not None:
        stmt = stmt.where(LLMUsageLog.created_at >= from_date)
    if organization_id:
        stmt = stmt.where(LLMUsageLog.organization_id == organization_id)
    return list(db.execute(stmt).all())
