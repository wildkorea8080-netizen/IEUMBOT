import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Document(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_org_chatbot_status", "organization_id", "chatbot_id", "status"),
        Index("ix_documents_org_title", "organization_id", "title"),
        Index("ix_documents_org_chatbot_corpus", "organization_id", "chatbot_id", "corpus_domain"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    corpus_domain: Mapped[str] = mapped_column(String(40), nullable=False, default="policy")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="documents")
    chatbot = relationship("ChatbotSetting", back_populates="documents")
    versions = relationship("DocumentVersion", back_populates="document")
    chunks = relationship("DocumentChunk", back_populates="document")
    citations = relationship("Citation", back_populates="document")
    ingestion_jobs = relationship("IngestionJob", back_populates="document")
