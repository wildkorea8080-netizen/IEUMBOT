from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session, aliased

from app.models import ChatMessage, ChatSession, ChatbotSetting, Document, DocumentVersion, WebSource, WidgetDeployment


def count_chatbots(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(ChatbotSetting.id)).where(ChatbotSetting.organization_id == organization_id)
    return int(db.execute(stmt).scalar_one())


def count_documents(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(Document.id)).where(
        Document.organization_id == organization_id,
        Document.deleted_at.is_(None),
    )
    return int(db.execute(stmt).scalar_one())


def count_chat_sessions(db: Session, *, organization_id: str) -> int:
    stmt = select(func.count(ChatSession.id)).where(ChatSession.organization_id == organization_id)
    return int(db.execute(stmt).scalar_one())


def count_answered_messages(db: Session, *, organization_id: str) -> tuple[int, int]:
    base = and_(
        ChatMessage.organization_id == organization_id,
        ChatMessage.role == "assistant",
        ChatMessage.is_test.is_(False),
    )
    total_stmt = select(func.count(ChatMessage.id)).where(base)
    success_stmt = select(func.count(ChatMessage.id)).where(base, ChatMessage.result_type == "answered")
    total = int(db.execute(total_stmt).scalar_one())
    success = int(db.execute(success_stmt).scalar_one())
    return success, total


def average_response_time_seconds(db: Session, *, organization_id: str) -> float:
    latency_stmt = select(func.avg(ChatMessage.latency_ms)).where(
        ChatMessage.organization_id == organization_id,
        ChatMessage.role == "assistant",
        ChatMessage.is_test.is_(False),
        ChatMessage.latency_ms.is_not(None),
    )
    latency_avg = db.execute(latency_stmt).scalar_one_or_none()
    if latency_avg is not None:
        return float(latency_avg) / 1000.0

    user_msg = aliased(ChatMessage)
    assistant_msg = aliased(ChatMessage)
    diff_stmt = (
        select(
            func.avg(
                func.extract("epoch", assistant_msg.created_at - user_msg.created_at),
            )
        )
        .select_from(assistant_msg)
        .join(
            user_msg,
            and_(
                assistant_msg.organization_id == user_msg.organization_id,
                assistant_msg.session_id == user_msg.session_id,
                assistant_msg.request_id == user_msg.request_id,
                user_msg.role == "user",
                assistant_msg.role == "assistant",
            ),
        )
        .where(
            assistant_msg.organization_id == organization_id,
            assistant_msg.is_test.is_(False),
            user_msg.is_test.is_(False),
        )
    )
    diff_avg = db.execute(diff_stmt).scalar_one_or_none()
    return float(diff_avg or 0.0)


def list_recent_conversations(db: Session, *, organization_id: str, limit_count: int = 8):
    assistant_stmt = (
        select(
            ChatMessage,
            ChatbotSetting.name.label("chatbot_name"),
        )
        .join(ChatbotSetting, ChatbotSetting.id == ChatMessage.chatbot_id)
        .where(
            ChatMessage.organization_id == organization_id,
            ChatMessage.role == "assistant",
            ChatMessage.is_test.is_(False),
        )
        .order_by(desc(ChatMessage.created_at))
        .limit(limit_count)
    )
    return list(db.execute(assistant_stmt).all())


def list_recent_assistant_messages(db: Session, *, organization_id: str, limit_count: int = 20) -> list[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.organization_id == organization_id,
            ChatMessage.role == "assistant",
            ChatMessage.is_test.is_(False),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(limit_count)
    )
    return list(db.execute(stmt).scalars().all())


def daily_session_counts(
    db: Session,
    *,
    organization_id: str,
    from_date: date,
    to_date: date,
) -> list[tuple[date, int]]:
    from_dt = datetime.combine(from_date, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    stmt = (
        select(
            func.date(ChatSession.created_at).label("d"),
            func.count(ChatSession.id).label("c"),
        )
        .where(
            ChatSession.organization_id == organization_id,
            ChatSession.created_at >= from_dt,
            ChatSession.created_at < to_dt,
        )
        .group_by(func.date(ChatSession.created_at))
        .order_by(func.date(ChatSession.created_at).asc())
    )
    rows = db.execute(stmt).all()
    return [(row[0], int(row[1])) for row in rows]


def daily_message_counts(
    db: Session,
    *,
    organization_id: str,
    from_date: date,
    to_date: date,
) -> list[tuple[date, int]]:
    from_dt = datetime.combine(from_date, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    stmt = (
        select(
            func.date(ChatMessage.created_at).label("d"),
            func.count(ChatMessage.id).label("c"),
        )
        .where(
            ChatMessage.organization_id == organization_id,
            ChatMessage.is_test.is_(False),
            ChatMessage.created_at >= from_dt,
            ChatMessage.created_at < to_dt,
        )
        .group_by(func.date(ChatMessage.created_at))
        .order_by(func.date(ChatMessage.created_at).asc())
    )
    rows = db.execute(stmt).all()
    return [(row[0], int(row[1])) for row in rows]


def list_user_message_contents_for_range(
    db: Session,
    *,
    organization_id: str,
    from_date: date,
    to_date: date,
    limit_count: int = 5000,
) -> list[str]:
    from_dt = datetime.combine(from_date, time.min, tzinfo=timezone.utc)
    to_dt = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    stmt = (
        select(ChatMessage.content)
        .where(
            ChatMessage.organization_id == organization_id,
            ChatMessage.role == "user",
            ChatMessage.is_test.is_(False),
            ChatMessage.created_at >= from_dt,
            ChatMessage.created_at < to_dt,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(limit_count)
    )
    return [row[0] for row in db.execute(stmt).all() if isinstance(row[0], str)]


def list_documents(db: Session, *, organization_id: str, query: str | None, status: str | None):
    latest_version_sq = (
        select(
            DocumentVersion.document_id.label("document_id"),
            func.max(DocumentVersion.version_number).label("latest_version_number"),
        )
        .where(DocumentVersion.organization_id == organization_id)
        .group_by(DocumentVersion.document_id)
        .subquery()
    )

    latest_version = aliased(DocumentVersion)
    stmt = (
        select(Document, latest_version)
        .outerjoin(latest_version_sq, latest_version_sq.c.document_id == Document.id)
        .outerjoin(
            latest_version,
            and_(
                latest_version.document_id == Document.id,
                latest_version.version_number == latest_version_sq.c.latest_version_number,
            ),
        )
        .where(Document.organization_id == organization_id, Document.deleted_at.is_(None))
    )
    if query:
        stmt = stmt.where(Document.title.ilike(f"%{query}%"))
    if status:
        stmt = stmt.where(Document.status == status)
    stmt = stmt.order_by(Document.updated_at.desc())
    return list(db.execute(stmt).all())


def get_document_by_id(db: Session, *, organization_id: str, document_id: str) -> Document | None:
    stmt = select(Document).where(
        Document.id == document_id,
        Document.organization_id == organization_id,
        Document.deleted_at.is_(None),
    )
    return db.execute(stmt).scalar_one_or_none()


def get_latest_document_version(db: Session, *, organization_id: str, document_id: str) -> DocumentVersion | None:
    stmt = (
        select(DocumentVersion)
        .where(
            DocumentVersion.organization_id == organization_id,
            DocumentVersion.document_id == document_id,
        )
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def list_chatbots(db: Session, *, organization_id: str) -> list[ChatbotSetting]:
    stmt = (
        select(ChatbotSetting)
        .where(ChatbotSetting.organization_id == organization_id)
        .order_by(ChatbotSetting.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_chatbot_by_id(db: Session, *, organization_id: str, chatbot_id: str) -> ChatbotSetting | None:
    stmt = select(ChatbotSetting).where(
        ChatbotSetting.id == chatbot_id,
        ChatbotSetting.organization_id == organization_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def count_documents_by_chatbot(db: Session, *, organization_id: str, chatbot_id: str) -> int:
    stmt = select(func.count(Document.id)).where(
        Document.organization_id == organization_id,
        Document.chatbot_id == chatbot_id,
        Document.deleted_at.is_(None),
    )
    return int(db.execute(stmt).scalar_one())


def count_web_sources_by_chatbot(db: Session, *, organization_id: str, chatbot_id: str) -> int:
    stmt = select(func.count(WebSource.id)).where(
        WebSource.organization_id == organization_id,
        WebSource.chatbot_id == chatbot_id,
        WebSource.is_deleted.is_(False),
    )
    return int(db.execute(stmt).scalar_one())


def get_widget_by_chatbot(db: Session, *, organization_id: str, chatbot_id: str) -> WidgetDeployment | None:
    stmt = (
        select(WidgetDeployment)
        .where(
            WidgetDeployment.organization_id == organization_id,
            WidgetDeployment.chatbot_id == chatbot_id,
        )
        .order_by(WidgetDeployment.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()
