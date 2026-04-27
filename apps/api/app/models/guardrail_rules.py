import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class GuardrailRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "guardrail_rules"
    __table_args__ = (
        Index(
            "ix_guardrail_rules_org_chatbot_active_priority",
            "organization_id",
            "chatbot_id",
            "is_active",
            "priority",
        ),
        Index(
            "ix_guardrail_rules_org_chatbot_rule_type",
            "organization_id",
            "chatbot_id",
            "rule_type",
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
    rule_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    match_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="keyword_any")
    match_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_type: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    fallback_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalation_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    organization = relationship("Organization", back_populates="guardrail_rules")
    chatbot = relationship("ChatbotSetting", back_populates="guardrail_rules")
    created_by_admin = relationship("Admin", back_populates="guardrail_rules")
