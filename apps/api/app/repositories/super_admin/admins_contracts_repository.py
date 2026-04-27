from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Admin, Contract, Organization, Plan


def get_organization_by_id(
    db: Session,
    *,
    organization_id: str,
) -> Organization | None:
    stmt = select(Organization).where(Organization.id == organization_id)
    return db.execute(stmt).scalar_one_or_none()


def list_admins_by_organization(
    db: Session,
    *,
    organization_id: str,
) -> list[Admin]:
    stmt = (
        select(Admin)
        .where(Admin.organization_id == organization_id)
        .order_by(Admin.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_admin_by_id(
    db: Session,
    *,
    admin_id: str,
) -> Admin | None:
    stmt = select(Admin).where(Admin.id == admin_id)
    return db.execute(stmt).scalar_one_or_none()


def get_admin_by_org_email(
    db: Session,
    *,
    organization_id: str,
    email: str,
    exclude_admin_id: str | None = None,
) -> Admin | None:
    stmt = select(Admin).where(
        Admin.organization_id == organization_id,
        func.lower(Admin.email) == email.lower(),
    )
    if exclude_admin_id:
        stmt = stmt.where(Admin.id != exclude_admin_id)
    return db.execute(stmt).scalar_one_or_none()


def get_admin_by_email(
    db: Session,
    *,
    email: str,
    exclude_admin_id: str | None = None,
) -> Admin | None:
    stmt = select(Admin).where(func.lower(Admin.email) == email.lower())
    if exclude_admin_id:
        stmt = stmt.where(Admin.id != exclude_admin_id)
    return db.execute(stmt).scalar_one_or_none()


def create_admin(
    db: Session,
    *,
    organization_id: str,
    email: str,
    name: str,
    role: str,
    status: str,
    password_hash: str,
    must_change_password: bool = False,
) -> Admin:
    row = Admin(
        organization_id=organization_id,
        email=email,
        name=name,
        role=role,
        status=status,
        password_hash=password_hash,
        must_change_password=must_change_password,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def list_contracts_by_organization(
    db: Session,
    *,
    organization_id: str,
) -> list[Contract]:
    stmt = (
        select(Contract)
        .where(Contract.organization_id == organization_id)
        .order_by(Contract.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def create_contract(
    db: Session,
    *,
    organization_id: str,
    plan_id: str | None,
    plan_name: str,
    start_date,
    end_date,
    current_period_start,
    current_period_end,
    current_usage_tokens: int,
    current_usage_cost: float,
    is_over_limit: bool,
    billing_status: str,
    monthly_conversation_limit: int | None,
    document_limit: int | None,
    website_limit: int | None,
    chatbot_limit: int | None,
    widget_limit: int | None,
    status: str,
) -> Contract:
    row = Contract(
        organization_id=organization_id,
        plan_id=plan_id,
        plan_name=plan_name,
        start_date=start_date,
        end_date=end_date,
        current_period_start=current_period_start,
        current_period_end=current_period_end,
        current_usage_tokens=current_usage_tokens,
        current_usage_cost=current_usage_cost,
        is_over_limit=is_over_limit,
        billing_status=billing_status,
        monthly_conversation_limit=monthly_conversation_limit,
        document_limit=document_limit,
        website_limit=website_limit,
        chatbot_limit=chatbot_limit,
        widget_limit=widget_limit,
        status=status,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def get_contract_by_id(
    db: Session,
    *,
    contract_id: str,
) -> Contract | None:
    stmt = select(Contract).where(Contract.id == contract_id)
    return db.execute(stmt).scalar_one_or_none()


def get_plan_by_id(
    db: Session,
    *,
    plan_id: str,
) -> Plan | None:
    stmt = select(Plan).where(Plan.id == plan_id)
    return db.execute(stmt).scalar_one_or_none()
