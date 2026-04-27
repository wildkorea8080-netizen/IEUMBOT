from datetime import UTC, datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import Organization, SystemAnnouncement, SystemMaintenance


def list_announcements(db: Session) -> list[tuple[SystemAnnouncement, str | None]]:
    stmt = (
        select(SystemAnnouncement, Organization.name)
        .outerjoin(Organization, Organization.id == SystemAnnouncement.target_organization_id)
        .order_by(SystemAnnouncement.start_at.desc(), SystemAnnouncement.created_at.desc())
    )
    return list(db.execute(stmt).all())


def get_announcement_by_id(db: Session, *, announcement_id: str) -> SystemAnnouncement | None:
    stmt = select(SystemAnnouncement).where(SystemAnnouncement.id == announcement_id)
    return db.execute(stmt).scalar_one_or_none()


def list_active_announcements(
    db: Session,
    *,
    organization_id: str | None,
) -> list[SystemAnnouncement]:
    now = datetime.now(UTC)
    scope_filters = [SystemAnnouncement.target_scope == "global"]
    if organization_id:
        scope_filters.append(
            and_(
                SystemAnnouncement.target_scope == "organization",
                SystemAnnouncement.target_organization_id == organization_id,
            )
        )
    stmt = (
        select(SystemAnnouncement)
        .where(
            SystemAnnouncement.is_active.is_(True),
            SystemAnnouncement.start_at <= now,
            or_(SystemAnnouncement.end_at.is_(None), SystemAnnouncement.end_at >= now),
            or_(*scope_filters),
        )
        .order_by(SystemAnnouncement.type.desc(), SystemAnnouncement.start_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_current_maintenance(db: Session) -> SystemMaintenance | None:
    now = datetime.now(UTC)
    stmt = (
        select(SystemMaintenance)
        .where(
            SystemMaintenance.is_active.is_(True),
            SystemMaintenance.start_at <= now,
            or_(SystemMaintenance.end_at.is_(None), SystemMaintenance.end_at >= now),
        )
        .order_by(SystemMaintenance.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def get_latest_maintenance(db: Session) -> SystemMaintenance | None:
    stmt = select(SystemMaintenance).order_by(SystemMaintenance.created_at.desc()).limit(1)
    return db.execute(stmt).scalar_one_or_none()
