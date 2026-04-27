from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChatMessage


def list_assistant_chat_messages_for_org(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None = None,
    limit_count: int = 200,
) -> list[ChatMessage]:
    stmt = select(ChatMessage).where(
        ChatMessage.organization_id == organization_id,
        ChatMessage.role == "assistant",
    )
    if chatbot_id:
        stmt = stmt.where(ChatMessage.chatbot_id == chatbot_id)
    stmt = stmt.order_by(ChatMessage.created_at.desc()).limit(limit_count)
    return list(db.execute(stmt).scalars().all())


def get_latest_user_question_for_session(
    db: Session,
    *,
    session_id: str,
    before_created_at,
) -> ChatMessage | None:
    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.session_id == session_id,
            ChatMessage.role == "user",
            ChatMessage.created_at <= before_created_at,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()
