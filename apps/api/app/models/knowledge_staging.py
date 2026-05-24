import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class KnowledgeStagingSession(Base):
    """지식 사전 검토 세션 — 업로드 후 등록 전 검토 단계."""

    __tablename__ = "knowledge_staging_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)  # file | text
    source_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ready", server_default="ready",
        comment="ready | partial | completed",
    )
    total_chunks: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_duplicate_file: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
        comment="True이면 동일 파일명 기존 문서 존재 → RAG 재등록 없이 FAQ만 생성",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class KnowledgeStagingChunk(Base):
    """AI가 분석한 주제 단위 청크 — 사용자 검토 후 개별 등록."""

    __tablename__ = "knowledge_staging_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_staging_sessions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    topic_title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # 민감정보
    pii_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    pii_regions: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]",
        comment='[{start, end, type, preview}]',
    )
    # 병합 후보
    merge_candidate_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    merge_candidate_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    merge_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    merge_original_content: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="병합 대상 기존 지식의 원본 텍스트 (diff 표시용)",
    )
    registration_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new", server_default="new",
        comment="new | merge",
    )
    # 등록 상태
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending",
        comment="pending | registered | skipped",
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
