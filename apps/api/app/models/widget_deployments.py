import secrets
import uuid

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


def _generate_widget_key() -> str:
    return f"wk_{secrets.token_urlsafe(24)}"


class WidgetDeployment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "widget_deployments"
    __table_args__ = (
        Index("ix_widget_deployments_org_chatbot_status", "organization_id", "chatbot_id", "status"),
        Index("ix_widget_deployments_widget_key", "widget_key", unique=True),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    widget_key: Mapped[str] = mapped_column(String(128), nullable=False, default=_generate_widget_key)
    allowed_domains: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    theme_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    position: Mapped[str] = mapped_column(String(30), nullable=False, default="bottom-right")
    launcher_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    welcome_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    install_script: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization = relationship("Organization", back_populates="widget_deployments")
    chatbot = relationship("ChatbotSetting", back_populates="widget_deployments")
