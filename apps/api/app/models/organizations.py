from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Organization(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "organizations"
    __table_args__ = (UniqueConstraint("slug", name="uq_organizations_slug"),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    primary_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Seoul")
    default_locale: Mapped[str] = mapped_column(String(16), nullable=False, default="ko-KR")
    # 관리자 콘솔 좌측 상단에 노출되는 기관 로고. base64 data URL 또는 외부 URL.
    # 미설정(None)이면 기본 '이음봇' 브랜드 마크를 표시한다.
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    admins = relationship("Admin", back_populates="organization")
    chatbot_settings = relationship("ChatbotSetting", back_populates="organization")
    documents = relationship("Document", back_populates="organization")
    document_versions = relationship("DocumentVersion", back_populates="organization")
    document_chunks = relationship("DocumentChunk", back_populates="organization")
    web_sources = relationship("WebSource", back_populates="organization")
    quick_actions = relationship("QuickAction", back_populates="organization")
    chat_sessions = relationship("ChatSession", back_populates="organization")
    chat_messages = relationship("ChatMessage", back_populates="organization")
    citations = relationship("Citation", back_populates="organization")
    audit_logs = relationship("AuditLog", back_populates="organization")
    ingestion_jobs = relationship("IngestionJob", back_populates="organization")
    synonym_entries = relationship("SynonymDictionary", back_populates="organization")
    retrieval_control_rules = relationship("RetrievalControlRule", back_populates="organization")
    guardrail_rules = relationship("GuardrailRule", back_populates="organization")
    escalation_rules = relationship("EscalationRule", back_populates="organization")
    contracts = relationship("Contract", back_populates="organization")
    widget_deployments = relationship("WidgetDeployment", back_populates="organization")
