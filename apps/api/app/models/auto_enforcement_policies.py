from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AutoEnforcementPolicy(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "auto_enforcement_policies"

    policy_type: Mapped[str] = mapped_column(String(40), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    threshold_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_window_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_count_threshold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
