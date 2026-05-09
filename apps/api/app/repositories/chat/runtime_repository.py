import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ChatMessage, ChatSession, Citation


def get_chat_session_by_token(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    session_token: str,
) -> ChatSession | None:
    stmt = select(ChatSession).where(
        ChatSession.organization_id == uuid.UUID(organization_id),
        ChatSession.chatbot_id == uuid.UUID(chatbot_id),
        ChatSession.session_token == session_token,
    )
    return db.execute(stmt).scalar_one_or_none()


def count_user_messages_in_session(
    db: Session,
    *,
    session_id: str,
) -> int:
    stmt = select(func.count(ChatMessage.id)).where(
        ChatMessage.session_id == uuid.UUID(session_id),
        ChatMessage.role == "user",
    )
    return int(db.execute(stmt).scalar_one() or 0)


def list_recent_session_messages(
    db: Session,
    *,
    session_id: str,
    limit: int = 8,
) -> list[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == uuid.UUID(session_id))
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def create_chat_session(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    session_token: str,
    source_url: str | None = None,
) -> ChatSession:
    row = ChatSession(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=uuid.UUID(chatbot_id),
        session_token=session_token,
        source_url=source_url,
        status="active",
        client_context={},
        started_at=datetime.now(UTC),
        last_message_at=datetime.now(UTC),
    )
    db.add(row)
    db.flush()
    return row


def create_chat_message(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    session_id: str,
    request_id: str,
    role: str,
    content: str,
    status: str,
    model_name: str | None,
    result_type: str | None,
    normalized_query: str | None,
    retrieved_documents: list[dict],
    selected_sources: list[dict],
    final_decision: dict,
    validation_signals: dict,
    metadata_json: dict | None = None,
    escalation_reason: str | None = None,
    escalation_target_department: str | None = None,
    escalation_target_queue: str | None = None,
) -> ChatMessage:
    row = ChatMessage(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=uuid.UUID(chatbot_id),
        session_id=uuid.UUID(session_id),
        request_id=request_id,
        role=role,
        content=content,
        content_masked=None,
        status=status,
        model_name=model_name,
        metadata_json=metadata_json or {},
        classification_result={},
        rewritten_query=None,
        normalized_query=normalized_query,
        query_decomposition=[],
        retrieved_documents=retrieved_documents,
        reranked_results=[],
        selected_sources=selected_sources,
        final_decision=final_decision,
        result_type=result_type,
        validation_signals=validation_signals,
        escalation_reason=escalation_reason,
        escalation_target_department=escalation_target_department,
        escalation_target_queue=escalation_target_queue,
        is_test=False,
    )
    db.add(row)
    db.flush()
    return row


def update_message_feedback(
    db: Session,
    *,
    message_id: str,
    feedback: int,
) -> ChatMessage | None:
    """피드백 업데이트. 없는 message_id면 None 반환."""
    from datetime import datetime, timezone
    msg = db.get(ChatMessage, uuid.UUID(message_id))
    if not msg:
        return None
    msg.user_feedback = feedback
    msg.feedback_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    return msg


def create_citations(
    db: Session,
    *,
    organization_id: str,
    chat_message_id: str,
    citations: list[dict],
) -> list[Citation]:
    rows: list[Citation] = []
    for index, item in enumerate(citations, start=1):
        row = Citation(
            organization_id=uuid.UUID(organization_id),
            chat_message_id=uuid.UUID(chat_message_id),
            document_id=uuid.UUID(item["documentId"]) if item.get("documentId") else None,
            document_version_id=(
                uuid.UUID(item["documentVersionId"]) if item.get("documentVersionId") else None
            ),
            document_chunk_id=None,
            title=item.get("documentName"),
            page_number=item.get("pageNumber"),
            snippet=None,
            source_url=item.get("sourceUrl"),
            source_type=item.get("sourceType"),
            section_title=item.get("sectionTitle"),
            retrieval_rank=item.get("finalRank"),
            rerank_score=item.get("score"),
            selection_reason=item.get("selectionReason"),
            sort_order=index,
            score=item.get("score"),
        )
        db.add(row)
        rows.append(row)
    db.flush()
    return rows
