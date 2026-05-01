from datetime import datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models import ChatMessage, ChatSession


def _base_sessions_stmt(*, organization_id: str) -> Select:
    latest_user_id_sq = (
        select(ChatMessage.id)
        .where(
            ChatMessage.session_id == ChatSession.id,
            ChatMessage.role == "user",
            ChatMessage.is_test.is_(False),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
        .scalar_subquery()
    )
    latest_assistant_id_sq = (
        select(ChatMessage.id)
        .where(
            ChatMessage.session_id == ChatSession.id,
            ChatMessage.role == "assistant",
            ChatMessage.is_test.is_(False),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
        .scalar_subquery()
    )

    latest_user = aliased(ChatMessage)
    latest_assistant = aliased(ChatMessage)
    return (
        select(ChatSession, latest_user, latest_assistant)
        .select_from(ChatSession)
        .outerjoin(latest_user, latest_user.id == latest_user_id_sq)
        .outerjoin(latest_assistant, latest_assistant.id == latest_assistant_id_sq)
        .where(ChatSession.organization_id == organization_id)
    )


def list_conversations(
    db: Session,
    *,
    organization_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
    question_query: str | None,
    answer_status: str | None,
    escalated: bool | None,
    has_citations: bool | None,
    llm_executed: bool | None,
    offset: int,
    limit: int,
):
    stmt = _base_sessions_stmt(organization_id=organization_id)

    if from_date is not None:
        stmt = stmt.where(func.coalesce(ChatSession.last_message_at, ChatSession.created_at) >= from_date)
    if to_date is not None:
        stmt = stmt.where(func.coalesce(ChatSession.last_message_at, ChatSession.created_at) <= to_date)
    if question_query:
        like_value = f"%{question_query}%"
        stmt = stmt.where(
            select(ChatMessage.id)
            .where(
                ChatMessage.session_id == ChatSession.id,
                ChatMessage.role == "user",
                ChatMessage.is_test.is_(False),
                or_(
                    ChatMessage.content.ilike(like_value),
                    ChatMessage.content_masked.ilike(like_value),
                ),
            )
            .exists()
        )
    if answer_status:
        stmt = stmt.where(
            select(ChatMessage.id)
            .where(
                ChatMessage.session_id == ChatSession.id,
                ChatMessage.role == "assistant",
                ChatMessage.is_test.is_(False),
                ChatMessage.result_type == answer_status,
            )
            .exists()
        )
    if escalated is not None:
        if escalated:
            stmt = stmt.where(
                select(ChatMessage.id)
                .where(
                    ChatMessage.session_id == ChatSession.id,
                    ChatMessage.role == "assistant",
                    ChatMessage.is_test.is_(False),
                    or_(
                        ChatMessage.result_type == "escalate",
                        ChatMessage.escalation_reason.is_not(None),
                    ),
                )
                .exists()
            )
        else:
            stmt = stmt.where(
                ~select(ChatMessage.id)
                .where(
                    ChatMessage.session_id == ChatSession.id,
                    ChatMessage.role == "assistant",
                    ChatMessage.is_test.is_(False),
                    or_(
                        ChatMessage.result_type == "escalate",
                        ChatMessage.escalation_reason.is_not(None),
                    ),
                )
                .exists()
            )
    if has_citations is not None:
        if has_citations:
            stmt = stmt.where(
                select(ChatMessage.id)
                .where(
                    ChatMessage.session_id == ChatSession.id,
                    ChatMessage.role == "assistant",
                    ChatMessage.is_test.is_(False),
                    func.jsonb_array_length(ChatMessage.selected_sources) > 0,
                )
                .exists()
            )
        else:
            stmt = stmt.where(
                ~select(ChatMessage.id)
                .where(
                    ChatMessage.session_id == ChatSession.id,
                    ChatMessage.role == "assistant",
                    ChatMessage.is_test.is_(False),
                    func.jsonb_array_length(ChatMessage.selected_sources) > 0,
                )
                .exists()
            )
    if llm_executed is not None:
        if llm_executed:
            stmt = stmt.where(
                select(ChatMessage.id)
                .where(
                    ChatMessage.session_id == ChatSession.id,
                    ChatMessage.role == "assistant",
                    ChatMessage.is_test.is_(False),
                    ChatMessage.model_name.is_not(None),
                )
                .exists()
            )
        else:
            stmt = stmt.where(
                ~select(ChatMessage.id)
                .where(
                    ChatMessage.session_id == ChatSession.id,
                    ChatMessage.role == "assistant",
                    ChatMessage.is_test.is_(False),
                    ChatMessage.model_name.is_not(None),
                )
                .exists()
            )

    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total_count = int(db.execute(count_stmt).scalar_one())

    stmt = stmt.order_by(func.coalesce(ChatSession.last_message_at, ChatSession.created_at).desc())
    stmt = stmt.offset(offset).limit(limit)
    return list(db.execute(stmt).all()), total_count


def get_conversation_detail_row(
    db: Session,
    *,
    organization_id: str,
    session_id: str,
):
    stmt = _base_sessions_stmt(organization_id=organization_id).where(ChatSession.id == session_id)
    return db.execute(stmt).first()


def get_session_by_id(
    db: Session,
    *,
    organization_id: str,
    session_id: str,
) -> ChatSession | None:
    stmt = select(ChatSession).where(
        ChatSession.id == session_id,
        ChatSession.organization_id == organization_id,
    )
    return db.execute(stmt).scalar_one_or_none()
