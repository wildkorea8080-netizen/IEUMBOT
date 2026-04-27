from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import BillingAlert, ChatSession, ChatbotSetting, Contract, LLMUsageLog, Organization, Plan


def list_plans(db: Session) -> list[Plan]:
    stmt = select(Plan).order_by(Plan.created_at.desc())
    return list(db.execute(stmt).scalars().all())


def get_plan_by_id(db: Session, *, plan_id: str) -> Plan | None:
    stmt = select(Plan).where(Plan.id == plan_id)
    return db.execute(stmt).scalar_one_or_none()


def get_active_contract_for_org(db: Session, *, organization_id: str) -> Contract | None:
    today = datetime.now(UTC).date()
    stmt = (
        select(Contract)
        .where(
            Contract.organization_id == organization_id,
            Contract.status == "active",
            Contract.start_date <= today,
            or_(Contract.end_date.is_(None), Contract.end_date >= today),
        )
        .order_by(Contract.start_date.desc(), Contract.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def get_contract_with_plan_by_id(db: Session, *, contract_id: str):
    stmt = select(Contract, Plan, Organization).outerjoin(Plan, Plan.id == Contract.plan_id).join(
        Organization, Organization.id == Contract.organization_id
    ).where(Contract.id == contract_id)
    return db.execute(stmt).one_or_none()


def list_contracts_with_plan(db: Session):
    stmt = (
        select(Contract, Plan, Organization)
        .outerjoin(Plan, Plan.id == Contract.plan_id)
        .join(Organization, Organization.id == Contract.organization_id)
        .order_by(Organization.name.asc(), Contract.created_at.desc())
    )
    return list(db.execute(stmt).all())


def summarize_llm_usage(
    db: Session,
    *,
    organization_id: str,
    period_start: date | None,
    period_end: date | None,
):
    stmt = select(
        func.coalesce(func.sum(LLMUsageLog.total_tokens), 0).label("total_tokens"),
        func.coalesce(func.sum(LLMUsageLog.estimated_cost), 0).label("estimated_cost"),
    ).where(LLMUsageLog.organization_id == organization_id)
    if period_start is not None:
        from_dt = datetime.combine(period_start, datetime.min.time(), tzinfo=UTC)
        stmt = stmt.where(LLMUsageLog.created_at >= from_dt)
    if period_end is not None:
        to_dt = datetime.combine(period_end + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        stmt = stmt.where(LLMUsageLog.created_at < to_dt)
    return db.execute(stmt).one()


def count_period_conversations(
    db: Session,
    *,
    organization_id: str,
    period_start: date | None,
    period_end: date | None,
) -> int:
    stmt = select(func.count(ChatSession.id)).where(ChatSession.organization_id == organization_id)
    if period_start is not None:
        from_dt = datetime.combine(period_start, datetime.min.time(), tzinfo=UTC)
        stmt = stmt.where(ChatSession.created_at >= from_dt)
    if period_end is not None:
        to_dt = datetime.combine(period_end + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        stmt = stmt.where(ChatSession.created_at < to_dt)
    return int(db.execute(stmt).scalar_one())


def count_active_chatbots(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(ChatbotSetting.id)).where(
        ChatbotSetting.organization_id == organization_id,
        ChatbotSetting.deleted_at.is_(None),
        ChatbotSetting.status == "active",
    )
    return int(db.execute(stmt).scalar_one())


def get_org_name(db: Session, *, organization_id: str) -> str | None:
    stmt = select(Organization.name).where(Organization.id == organization_id)
    return db.execute(stmt).scalar_one_or_none()


def get_recent_alert(
    db: Session,
    *,
    contract_id: str,
    metric_key: str,
    level: str,
    period_start: date | None,
):
    stmt = select(BillingAlert).where(
        BillingAlert.contract_id == contract_id,
        BillingAlert.metric_key == metric_key,
        BillingAlert.level == level,
    )
    if period_start is not None:
        from_dt = datetime.combine(period_start, datetime.min.time(), tzinfo=UTC)
        stmt = stmt.where(BillingAlert.created_at >= from_dt)
    stmt = stmt.order_by(BillingAlert.created_at.desc()).limit(1)
    return db.execute(stmt).scalar_one_or_none()


def list_recent_billing_alerts(db: Session, *, limit_count: int = 100) -> list[BillingAlert]:
    stmt = select(BillingAlert).order_by(BillingAlert.created_at.desc()).limit(limit_count)
    return list(db.execute(stmt).scalars().all())
