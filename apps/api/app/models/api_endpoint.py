import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ApiEndpoint(Base):
    """외부 API 연동 설정."""

    __tablename__ = "api_endpoints"

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
    endpoint_url: Mapped[str] = mapped_column(Text, nullable=False)
    method: Mapped[str] = mapped_column(
        String(10), nullable=False, default="GET", server_default="GET"
    )
    headers: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}",
        comment="인증 헤더 등 고정 헤더",
    )
    params: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}",
        comment="고정 파라미터",
    )
    intent_keywords: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]",
        comment='["채용", "공고"] — 이 키워드 포함 시 API 호출',
    )
    response_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="text", server_default="text",
        comment="text | view | list",
    )
    response_path: Mapped[str | None] = mapped_column(
        String(200), nullable=True,
        comment="text 타입 JSONPath (예: $.data.items)",
    )
    response_template: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="text 타입 AI 전달 템플릿",
    )
    view_config: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment='view 타입: {titlePath, contentPath, moreLinkPath, moreLinkFollow}',
    )
    list_config: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment='list 타입: {itemsPath, columnLabels, contentFields, sourceLinkPath, targetLinkFont}',
    )
    cache_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60, server_default="60"
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
