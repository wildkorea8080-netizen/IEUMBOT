import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ChatSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        UniqueConstraint("organization_id", "session_token", name="uq_chat_sessions_org_token"),
        Index("ix_chat_sessions_org_chatbot_created", "organization_id", "chatbot_id", "created_at"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    session_token: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    client_context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # deferred=True: 표준 SELECT에 포함하지 않음 → 마이그레이션 미적용 환경에서도 세션 로드 가능
    context_entities: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, deferred=True, comment="대화 중 추적된 엔티티 누적 저장"
    )

    organization = relationship("Organization", back_populates="chat_sessions")
    chatbot = relationship("ChatbotSetting", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session")
