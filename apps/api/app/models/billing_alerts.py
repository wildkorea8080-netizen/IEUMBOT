import uuid

from sqlalchemy import Float, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class BillingAlert(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "billing_alerts"
    __table_args__ = (
        Index("ix_billing_alerts_org_created", "organization_id", "created_at"),
        Index("ix_billing_alerts_contract_metric", "contract_id", "metric_key", "level"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False
    )
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    metric_key: Mapped[str] = mapped_column(String(60), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    threshold_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_value: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    limit_value: Mapped[float | None] = mapped_column(Float, nullable=True)
