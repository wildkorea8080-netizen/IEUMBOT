from sqlalchemy import Boolean, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SystemApiConfig(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "system_api_configs"
    __table_args__ = (
        Index("ix_system_api_configs_active_default", "is_active", "is_default"),
        Index("ix_system_api_configs_provider_active", "provider", "is_active"),
    )

    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    default_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    monthly_budget_limit: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)

