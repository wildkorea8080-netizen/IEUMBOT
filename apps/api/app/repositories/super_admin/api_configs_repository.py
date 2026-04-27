from datetime import datetime

from sqlalchemy import case, desc, func, select, update
from sqlalchemy.orm import Session

from app.models import LLMUsageLog, SystemApiConfig


def list_api_configs(db: Session):
    stmt = select(SystemApiConfig).order_by(desc(SystemApiConfig.is_default), desc(SystemApiConfig.created_at))
    return list(db.execute(stmt).scalars().all())


def get_api_config_by_id(db: Session, *, config_id: str) -> SystemApiConfig | None:
    stmt = select(SystemApiConfig).where(SystemApiConfig.id == config_id)
    return db.execute(stmt).scalar_one_or_none()


def get_default_active_api_config(db: Session) -> SystemApiConfig | None:
    stmt = (
        select(SystemApiConfig)
        .where(SystemApiConfig.is_active.is_(True), SystemApiConfig.is_default.is_(True))
        .order_by(SystemApiConfig.updated_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def get_latest_active_api_config(db: Session) -> SystemApiConfig | None:
    stmt = (
        select(SystemApiConfig)
        .where(SystemApiConfig.is_active.is_(True))
        .order_by(SystemApiConfig.updated_at.desc(), SystemApiConfig.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def unset_default_api_configs(db: Session, *, exclude_config_id: str | None = None) -> None:
    stmt = update(SystemApiConfig).where(SystemApiConfig.is_default.is_(True))
    if exclude_config_id:
        stmt = stmt.where(SystemApiConfig.id != exclude_config_id)
    db.execute(stmt.values(is_default=False))


def create_llm_usage_log(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    api_config_id: str | None,
    provider: str,
    model: str | None,
    operation_type: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    estimated_cost: float,
    success: bool,
    error_code: str | None,
    latency_ms: int | None,
) -> LLMUsageLog:
    row = LLMUsageLog(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        api_config_id=api_config_id,
        provider=provider,
        model=model,
        operation_type=operation_type,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        estimated_cost=estimated_cost,
        success=success,
        error_code=error_code,
        latency_ms=latency_ms,
    )
    db.add(row)
    db.flush()
    return row


def summarize_api_usage(db: Session, *, from_date: datetime | None = None, organization_id: str | None = None):
    stmt = select(
        func.count(LLMUsageLog.id).label("total_calls"),
        func.coalesce(func.sum(LLMUsageLog.total_tokens), 0).label("total_tokens"),
        func.coalesce(func.sum(LLMUsageLog.estimated_cost), 0).label("estimated_cost"),
        func.coalesce(func.sum(case((LLMUsageLog.success.is_(False), 1), else_=0)), 0).label("failed_calls"),
    )
    if organization_id:
        stmt = stmt.where(LLMUsageLog.organization_id == organization_id)
    if from_date is not None:
        stmt = stmt.where(LLMUsageLog.created_at >= from_date)
    return db.execute(stmt).one()
