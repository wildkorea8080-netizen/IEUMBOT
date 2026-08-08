"""answer_evaluations DB 접근."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AnswerEvaluation, ChatMessage


def list_evaluations(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None,
    start_at: datetime,
    end_at: datetime,
) -> list[AnswerEvaluation]:
    stmt = select(AnswerEvaluation).where(
        AnswerEvaluation.organization_id == uuid.UUID(organization_id),
        AnswerEvaluation.evaluated_at >= start_at,
        AnswerEvaluation.evaluated_at < end_at,
    )
    if chatbot_id:
        stmt = stmt.where(AnswerEvaluation.chatbot_id == uuid.UUID(chatbot_id))
    return list(db.execute(stmt).scalars().all())


def list_review_needed(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None,
    start_at: datetime,
    end_at: datetime,
    limit: int = 50,
) -> list[AnswerEvaluation]:
    stmt = (
        select(AnswerEvaluation)
        .where(
            AnswerEvaluation.organization_id == uuid.UUID(organization_id),
            AnswerEvaluation.needs_review.is_(True),
            AnswerEvaluation.evaluated_at >= start_at,
            AnswerEvaluation.evaluated_at < end_at,
        )
        .order_by(AnswerEvaluation.evaluated_at.desc())
        .limit(limit)
    )
    if chatbot_id:
        stmt = stmt.where(AnswerEvaluation.chatbot_id == uuid.UUID(chatbot_id))
    return list(db.execute(stmt).scalars().all())


def list_unevaluated_messages(
    db: Session,
    *,
    chatbot_id: str,
    start_at: datetime,
    end_at: datetime,
    limit: int,
) -> list[ChatMessage]:
    """아직 평가되지 않은 assistant 메시지. 세부 제외 규칙은 selector가 판단한다."""
    evaluated = select(AnswerEvaluation.message_id)
    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.chatbot_id == uuid.UUID(chatbot_id),
            ChatMessage.role == "assistant",
            ChatMessage.is_test.is_(False),
            ChatMessage.created_at >= start_at,
            ChatMessage.created_at < end_at,
            ChatMessage.id.not_in(evaluated),
        )
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def count_evaluated_since(db: Session, *, organization_id: str, since: datetime) -> int:
    """일일 상한 확인용."""
    from sqlalchemy import func  # noqa: PLC0415

    stmt = select(func.count(AnswerEvaluation.id)).where(
        AnswerEvaluation.organization_id == uuid.UUID(organization_id),
        AnswerEvaluation.evaluated_at >= since,
    )
    return int(db.execute(stmt).scalar() or 0)


def insert_evaluation(db: Session, *, row: AnswerEvaluation) -> None:
    db.add(row)
