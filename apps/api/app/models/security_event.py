import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SecurityEvent(Base):
    """보안 이벤트 기록 테이블."""

    __tablename__ = "security_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_settings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    event_type: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="privacy_exposure / abnormal_access / inappropriate / negative_emotion",
    )
    severity: Mapped[str] = mapped_column(
        String(10), nullable=False,
        comment="low / medium / high",
    )
    question_masked: Mapped[str] = mapped_column(Text, nullable=False)
    detected_patterns: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list,
        comment="감지된 패턴 목록",
    )
    ai_response: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="AI가 실제로 어떻게 응답했는지 (blocked / answered 등)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
