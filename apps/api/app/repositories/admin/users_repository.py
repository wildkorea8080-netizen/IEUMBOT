from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User


def list_users_by_organization(db: Session, *, organization_id: str) -> list[User]:
    stmt = select(User).where(User.organization_id == organization_id).order_by(User.created_at.desc())
    return list(db.execute(stmt).scalars().all())


def get_user_by_id(db: Session, *, user_id: str) -> User | None:
    stmt = select(User).where(User.id == user_id)
    return db.execute(stmt).scalar_one_or_none()


def get_user_by_email(db: Session, *, email: str, exclude_user_id: str | None = None) -> User | None:
    stmt = select(User).where(func.lower(User.email) == email.lower())
    if exclude_user_id:
        stmt = stmt.where(User.id != exclude_user_id)
    return db.execute(stmt).scalar_one_or_none()


def create_user(
    db: Session,
    *,
    organization_id: str,
    email: str,
    password_hash: str,
    role: str,
    status: str,
) -> User:
    row = User(
        organization_id=organization_id,
        email=email,
        password_hash=password_hash,
        role=role,
        status=status,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row
