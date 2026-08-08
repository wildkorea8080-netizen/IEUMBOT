import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AnswerEvaluation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """답변 1건에 대한 품질 채점 결과.

    점수가 NULL인 경우가 정상적으로 존재한다 — 첫 턴에는 대화 맥락이 성립하지 않고,
    추천질문이 없으면 그 적합성도 없다. 0점으로 채우면 평균이 왜곡되므로 NULL로 두고
    집계 분모에서 제외한다.
    """

    __tablename__ = "answer_evaluations"
    __table_args__ = (
        # 같은 메시지를 두 번 평가하지 않는다. 소급 평가를 여러 번 눌러도 안전하다.
        UniqueConstraint("message_id", name="uq_answer_evaluations_message"),
        Index("ix_answer_evaluations_chatbot_time", "chatbot_id", "evaluated_at"),
        Index("ix_answer_evaluations_review", "chatbot_id", "needs_review"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    relevance_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    groundedness_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    context_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    followup_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    topic_drift: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 지표별 판정 사유. 심사 표본 검증과 검토 목록 표시에 쓴다.
    verdict_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # 'llm' | 'rule' | 'failed' — "이 수치는 전부 AI가 채점한 것입니까"에 답하기 위해 구분한다.
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="llm")
    evaluator_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # 채점 기준이 바뀌면 전후 수치를 그대로 비교하면 안 된다.
    prompt_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1")

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 평가 시점 단가로 계산한 스냅샷. 권위 있는 값은 토큰이다.
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
