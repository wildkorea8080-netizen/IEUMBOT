import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class QuickAction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "quick_actions"
    __table_args__ = (
        Index("ix_quick_actions_org_chatbot_order", "organization_id", "chatbot_id", "sort_order"),
        Index("ix_quick_actions_chatbot_parent_order", "chatbot_id", "parent_id", "sort_order"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    # 2단 메뉴 트리: NULL이면 대분류(category), 값이 있으면 그 대분류의 자식.
    # 이 테이블은 소프트 삭제(is_deleted)를 쓰므로 아래 CASCADE는 평시 동작하지 않는다
    # — 자식 정리는 서비스 계층이 명시적으로 수행한다.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quick_actions.id", ondelete="CASCADE"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    action_type: Mapped[str] = mapped_column(String(30), nullable=False, default="question")
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    display_location: Mapped[str] = mapped_column(String(30), nullable=False, default="welcome")
    sort_order: Mapped[int] = mapped_column(nullable=False, default=1)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="quick_actions")
    chatbot = relationship("ChatbotSetting", back_populates="quick_actions")
