import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ConditionalResponse(Base):
    """조건별 CTA(Call-To-Action) 추가 응답 규칙."""

    __tablename__ = "conditional_responses"

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
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    trigger_keywords: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list,
        comment='["신청", "지원", "방법"] — OR 조건',
    )
    trigger_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="both",
        comment="question / answer / both",
    )
    action_type: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="link / video / file / contact",
    )
    action_label: Mapped[str] = mapped_column(String(100), nullable=False)
    action_value: Mapped[str] = mapped_column(Text, nullable=False)
    action_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    priority: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
        comment="낮을수록 높은 우선순위",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
