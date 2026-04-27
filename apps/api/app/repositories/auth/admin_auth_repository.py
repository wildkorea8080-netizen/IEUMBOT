from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Admin


def get_active_admin_by_email(db: Session, email: str) -> Admin | None:
    stmt = (
        select(Admin)
        .where(Admin.email == email, Admin.status == "active")
        .order_by(Admin.created_at.asc())
        .limit(1)
    )
    return db.execute(stmt).scalars().first()


def get_active_admin_by_id(db: Session, admin_id: str) -> Admin | None:
    stmt = select(Admin).where(Admin.id == admin_id, Admin.status == "active")
    return db.execute(stmt).scalar_one_or_none()
