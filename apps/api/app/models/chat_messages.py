import uuid

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ChatMessage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_session_created", "session_id", "created_at"),
        Index("ix_chat_messages_org_chatbot", "organization_id", "chatbot_id"),
        Index("ix_chat_messages_org_chatbot_result_type", "organization_id", "chatbot_id", "result_type"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_masked: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="completed")
    model_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    classification_result: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    rewritten_query: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_query: Mapped[str | None] = mapped_column(Text, nullable=True)
    query_decomposition: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    retrieved_documents: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    reranked_results: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    selected_sources: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    final_decision: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    result_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    validation_signals: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    escalation_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    escalation_target_department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    escalation_target_queue: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # deferred=True: 마이그레이션 미적용 환경에서도 메시지 로드 가능하도록 지연 로딩
    user_feedback: Mapped[int | None] = mapped_column(SmallInteger, nullable=True, deferred=True)
    # 1 = 좋아요, -1 = 싫어요, None = 미응답
    feedback_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, deferred=True)

    organization = relationship("Organization", back_populates="chat_messages")
    chatbot = relationship("ChatbotSetting", back_populates="chat_messages")
    session = relationship("ChatSession", back_populates="messages")
    citations = relationship("Citation", back_populates="chat_message")
