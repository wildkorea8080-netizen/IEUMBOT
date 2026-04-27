from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Admin, ChatMessage, ChatbotSetting, Contract, Organization, WidgetDeployment


def list_organizations(
    db: Session,
    *,
    query: str | None,
    status: str | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[Organization, int, str | None]], int]:
    chatbot_count_sq = (
        select(func.count(ChatbotSetting.id))
        .where(ChatbotSetting.organization_id == Organization.id)
        .correlate(Organization)
        .scalar_subquery()
    )
    contract_status_sq = (
        select(Contract.status)
        .where(Contract.organization_id == Organization.id)
        .order_by(Contract.created_at.desc())
        .limit(1)
        .correlate(Organization)
        .scalar_subquery()
    )

    where_clauses = []
    if status:
        where_clauses.append(Organization.status == status)
    if query:
        search = f"%{query}%"
        where_clauses.append(
            or_(
                Organization.name.ilike(search),
                Organization.primary_domain.ilike(search),
                Organization.contact_email.ilike(search),
            )
        )

    base_stmt = select(Organization).where(*where_clauses)
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = int(db.execute(count_stmt).scalar_one())

    stmt = (
        select(
            Organization,
            chatbot_count_sq.label("chatbot_count"),
            contract_status_sq.label("contract_status"),
        )
        .where(*where_clauses)
        .order_by(Organization.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list(db.execute(stmt).all())
    return rows, total


def get_organization_by_id(
    db: Session,
    *,
    organization_id: str,
) -> Organization | None:
    stmt = select(Organization).where(Organization.id == organization_id)
    return db.execute(stmt).scalar_one_or_none()


def get_organization_by_primary_domain(
    db: Session,
    *,
    primary_domain: str,
    exclude_organization_id: str | None = None,
) -> Organization | None:
    stmt = select(Organization).where(func.lower(Organization.primary_domain) == primary_domain.lower())
    if exclude_organization_id:
        stmt = stmt.where(Organization.id != exclude_organization_id)
    return db.execute(stmt).scalar_one_or_none()


def get_organization_by_slug(
    db: Session,
    *,
    slug: str,
) -> Organization | None:
    stmt = select(Organization).where(Organization.slug == slug)
    return db.execute(stmt).scalar_one_or_none()


def create_organization(
    db: Session,
    *,
    name: str,
    slug: str,
    status: str,
    primary_domain: str | None,
    contact_name: str | None,
    contact_email: str | None,
    contact_phone: str | None,
) -> Organization:
    row = Organization(
        name=name,
        slug=slug,
        status=status,
        primary_domain=primary_domain,
        contact_name=contact_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def get_latest_contract_summary(
    db: Session,
    *,
    organization_id: str,
) -> Contract | None:
    stmt = (
        select(Contract)
        .where(Contract.organization_id == organization_id)
        .order_by(Contract.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def count_admins_by_organization(
    db: Session,
    *,
    organization_id: str,
) -> int:
    stmt = select(func.count(Admin.id)).where(Admin.organization_id == organization_id)
    return int(db.execute(stmt).scalar_one())


def count_chatbots_by_organization(
    db: Session,
    *,
    organization_id: str,
) -> int:
    stmt = select(func.count(ChatbotSetting.id)).where(ChatbotSetting.organization_id == organization_id)
    return int(db.execute(stmt).scalar_one())


def count_widgets_by_organization(
    db: Session,
    *,
    organization_id: str,
) -> int:
    stmt = select(func.count(WidgetDeployment.id)).where(WidgetDeployment.organization_id == organization_id)
    return int(db.execute(stmt).scalar_one())


def count_chat_messages_last_30_days(
    db: Session,
    *,
    organization_id: str,
) -> int:
    from_date = datetime.now(UTC) - timedelta(days=30)
    stmt = select(func.count(ChatMessage.id)).where(
        ChatMessage.organization_id == organization_id,
        ChatMessage.created_at >= from_date,
    )
    return int(db.execute(stmt).scalar_one())
