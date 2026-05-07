import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class DocumentVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_document_versions_doc_version"),
        Index("ix_document_versions_org_status", "organization_id", "status"),
        Index("ix_document_versions_org_chatbot_active", "organization_id", "chatbot_id", "is_active"),
        Index("ix_document_versions_org_chatbot_source", "organization_id", "chatbot_id", "source_type"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False, default="application/pdf")
    page_count: Mapped[int | None] = mapped_column(nullable=True)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="pdf")
    corpus_domain: Mapped[str] = mapped_column(String(40), nullable=False, default="policy")
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiration_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    document_priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    manual_boost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_search_suppressed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    manual_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    issuing_department: Mapped[str | None] = mapped_column(String(150), nullable=True)
    audience: Mapped[str | None] = mapped_column(Text, nullable=True)
    exceptions_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_text_length: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    chunk_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    embedding_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)

    organization = relationship("Organization", back_populates="document_versions")
    document = relationship("Document", back_populates="versions")
    chatbot = relationship("ChatbotSetting", back_populates="document_versions")
    chunks = relationship("DocumentChunk", back_populates="document_version")
    citations = relationship("Citation", back_populates="document_version")
    ingestion_jobs = relationship("IngestionJob", back_populates="document_version")
