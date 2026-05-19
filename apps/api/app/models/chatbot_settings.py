import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ChatbotSetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chatbot_settings"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_chatbot_settings_org_name"),
        Index("ix_chatbot_settings_org_status", "organization_id", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    welcome_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    quick_reply_hints: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
        comment="미리 정의된 질문 힌트 버튼 목록",
    )
    description_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    fallback_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    persona: Mapped[str | None] = mapped_column(Text, nullable=True)
    tone: Mapped[str] = mapped_column(String(30), nullable=False, default="polite")
    answer_length: Mapped[str] = mapped_column(String(30), nullable=False, default="medium")
    theme: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    business_hours: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    privacy_notice: Mapped[str | None] = mapped_column(Text, nullable=True)
    citation_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="visible")
    web_search_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    skip_duplicate_file_reindex: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        comment="동일 파일명 재업로드 시 재학습 건너뜀",
    )
    allowed_domains: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    answer_priority_policy: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: [
            "uploaded_document",
            "official_website_indexed",
            "official_notice",
            "external_web_exception",
        ],
    )
    corpus_domain_policy: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    search_control_policy: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    answer_validation_policy: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    guardrail_policy: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    escalation_policy: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    answer_settings_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    response_format_rules: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]",
        comment="응답 형식 규칙 목록 [{keywords, format, more_link}]",
    )
    settings_version: Mapped[int] = mapped_column(nullable=False, default=1)
    custom_instructions: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default="",
        comment="기관별 자유 형식 추가 지시문 (system prompt 마지막에 삽입)",
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="chatbot_settings")
    documents = relationship("Document", back_populates="chatbot")
    document_versions = relationship("DocumentVersion", back_populates="chatbot")
    document_chunks = relationship("DocumentChunk", back_populates="chatbot")
    web_sources = relationship("WebSource", back_populates="chatbot")
    quick_actions = relationship("QuickAction", back_populates="chatbot")
    synonym_entries = relationship("SynonymDictionary", back_populates="chatbot")
    retrieval_control_rules = relationship("RetrievalControlRule", back_populates="chatbot")
    guardrail_rules = relationship("GuardrailRule", back_populates="chatbot")
    escalation_rules = relationship("EscalationRule", back_populates="chatbot")
    widget_deployments = relationship("WidgetDeployment", back_populates="chatbot")
    chat_sessions = relationship("ChatSession", back_populates="chatbot")
    chat_messages = relationship("ChatMessage", back_populates="chatbot")
    ingestion_jobs = relationship("IngestionJob", back_populates="chatbot")
