from datetime import datetime

from sqlalchemy import func, not_, or_, select
from sqlalchemy.orm import Session

from app.models import Admin, AuditLog


def list_audit_logs(
    db: Session,
    *,
    organization_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
    admin_email: str | None,
    action_filters: list[str] | None,
    offset: int,
    limit: int,
):
    stmt = (
        select(AuditLog, Admin)
        .outerjoin(Admin, Admin.id == AuditLog.admin_id)
        .where(
            AuditLog.organization_id == organization_id,
            not_(AuditLog.action.like("super_admin.%")),
            or_(Admin.role.is_(None), Admin.role != "super_admin"),
        )
    )
    if from_date is not None:
        stmt = stmt.where(AuditLog.created_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(AuditLog.created_at <= to_date)
    if admin_email:
        stmt = stmt.where(Admin.email.ilike(f"%{admin_email}%"))
    if action_filters:
        stmt = stmt.where(or_(*[AuditLog.action.ilike(pattern) for pattern in action_filters]))

    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total_count = int(db.execute(count_stmt).scalar_one())
    rows = list(
        db.execute(stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)).all()
    )
    return rows, total_count


def get_audit_log_detail(
    db: Session,
    *,
    organization_id: str,
    log_id: str,
):
    stmt = (
        select(AuditLog, Admin)
        .outerjoin(Admin, Admin.id == AuditLog.admin_id)
        .where(
            AuditLog.organization_id == organization_id,
            AuditLog.id == log_id,
            not_(AuditLog.action.like("super_admin.%")),
            or_(Admin.role.is_(None), Admin.role != "super_admin"),
        )
    )
    return db.execute(stmt).first()

