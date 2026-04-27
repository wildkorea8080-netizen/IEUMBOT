from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class SystemMaintenance(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "system_maintenance"
    __table_args__ = (Index("ix_system_maintenance_active_window", "is_active", "start_at", "end_at"),)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="read_only")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    allowed_paths: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    allowed_roles: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
