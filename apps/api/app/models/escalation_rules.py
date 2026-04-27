import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class EscalationRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "escalation_rules"
    __table_args__ = (
        Index(
            "ix_escalation_rules_org_chatbot_active_priority",
            "organization_id",
            "chatbot_id",
            "is_active",
            "priority",
        ),
        Index(
            "ix_escalation_rules_org_chatbot_trigger",
            "organization_id",
            "chatbot_id",
            "trigger_type",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admins.id", ondelete="SET NULL"), nullable=True
    )
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_department: Mapped[str] = mapped_column(String(120), nullable=False)
    target_queue: Mapped[str] = mapped_column(String(120), nullable=False)
    fallback_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    organization = relationship("Organization", back_populates="escalation_rules")
    chatbot = relationship("ChatbotSetting", back_populates="escalation_rules")
    created_by_admin = relationship("Admin", back_populates="escalation_rules")
