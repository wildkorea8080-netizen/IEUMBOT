import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SynonymDictionary(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "synonym_dictionary"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "chatbot_id",
            "canonical_term",
            "synonym_term",
            name="uq_synonym_dictionary_org_chatbot_terms",
        ),
        Index("ix_synonym_dictionary_org_chatbot_active", "organization_id", "chatbot_id", "is_active"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="SET NULL"), nullable=True
    )
    canonical_term: Mapped[str] = mapped_column(String(120), nullable=False)
    synonym_term: Mapped[str] = mapped_column(String(120), nullable=False)
    is_bidirectional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    scope: Mapped[str] = mapped_column(String(30), nullable=False, default="global")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    organization = relationship("Organization", back_populates="synonym_entries")
    chatbot = relationship("ChatbotSetting", back_populates="synonym_entries")
