import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Contract(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "contracts"
    __table_args__ = (
        Index("ix_contracts_org_status", "organization_id", "status"),
        Index("ix_contracts_org_date_range", "organization_id", "start_date", "end_date"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL"), nullable=True
    )
    plan_name: Mapped[str] = mapped_column(String(80), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    current_period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    current_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    current_usage_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_usage_cost: Mapped[float] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    is_over_limit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    billing_status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    monthly_conversation_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    document_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    website_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chatbot_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    widget_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")

    organization = relationship("Organization", back_populates="contracts")
    plan = relationship("Plan")
