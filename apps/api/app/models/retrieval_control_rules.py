import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class RetrievalControlRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "retrieval_control_rules"
    __table_args__ = (
        Index(
            "ix_retrieval_control_rules_org_chatbot_type_active",
            "organization_id",
            "chatbot_id",
            "rule_type",
            "is_active",
        ),
        Index(
            "ix_retrieval_control_rules_org_chatbot_target",
            "organization_id",
            "chatbot_id",
            "target_type",
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
    rule_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_type: Mapped[str] = mapped_column(String(30), nullable=False)
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    document_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document_versions.id", ondelete="SET NULL"), nullable=True
    )
    corpus_domain: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    query_pattern: Mapped[str | None] = mapped_column(String(200), nullable=True)
    boost_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    organization = relationship("Organization", back_populates="retrieval_control_rules")
    chatbot = relationship("ChatbotSetting", back_populates="retrieval_control_rules")
    created_by_admin = relationship("Admin", back_populates="retrieval_control_rules")
    document = relationship("Document")
    document_version = relationship("DocumentVersion")
