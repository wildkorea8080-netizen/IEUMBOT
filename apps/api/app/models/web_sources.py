import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class WebSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "web_sources"
    __table_args__ = (
        Index("ix_web_sources_org_chatbot_status", "organization_id", "chatbot_id", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    base_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    sync_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    allowed_domains: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    excluded_paths: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    crawl_depth: Mapped[int] = mapped_column(nullable=False, default=1)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="web_sources")
    chatbot = relationship("ChatbotSetting", back_populates="web_sources")
    ingestion_jobs = relationship("IngestionJob", back_populates="web_source")
