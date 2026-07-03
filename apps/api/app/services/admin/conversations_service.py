from datetime import UTC, datetime, time
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import ChatMessage
from app.repositories.admin.conversations_repository import (
    get_conversation_detail_row,
    get_session_by_id,
    list_conversations,
)
from app.schemas.conversations import (
    AdminConversationCitationSummary,
    AdminConversationDetailResponse,
    AdminConversationItem,
    AdminConversationPromptTrace,
    AdminConversationsListResponse,
    AdminConversationUpdateRequest,
)
from app.services.admin.scope_service import require_institution_organization_id


def _parse_datetime_range(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        date_value = datetime.fromisoformat(value).date()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="INVALID_DATE_FORMAT",
        ) from exc
    base = datetime.combine(date_value, time.max if end_of_day else time.min, tzinfo=UTC)
    return base


def _mask_content(message: ChatMessage | None) -> str | None:
    if message is None:
        return None
    return message.content_masked or message.content


def _status_meta(message: ChatMessage | None) -> tuple[str, str]:
    if message is None:
        return "error", "오류"
    outcome = (message.result_type or "").lower()
    if outcome == "answered":
        return "answered", "답변성공"
    if outcome in {"insufficient_evidence", "clarification"}:
        return "insufficient_evidence", "근거부족"
    if outcome == "escalate" or message.escalation_reason:
        return "escalated", "이관"
    if outcome in {"restricted", "conflict"}:
        return "blocked", "차단"
    return "error", "오류"


def _fallback_message(message: ChatMessage | None) -> str | None:
    if message is None:
        return None
    status_key, _ = _status_meta(message)
    if status_key in {"insufficient_evidence", "blocked", "escalated"}:
        return _mask_content(message)
    return None


def _citation_summary(message: ChatMessage | None) -> list[AdminConversationCitationSummary]:
    if message is None:
        return []
    summaries: list[AdminConversationCitationSummary] = []
    for item in list(message.selected_sources or [])[:5]:
        if not isinstance(item, dict):
            continue
        _score = item.get("score")
        if _score is None:
            _score = item.get("combinedScore") or item.get("combined_score")
        summaries.append(
            AdminConversationCitationSummary(
                title=item.get("title") or item.get("documentName") or item.get("document_name"),
                source_type=item.get("sourceType") or item.get("source_type"),
                source_url=item.get("sourceUrl") or item.get("source_url"),
                page_number=item.get("pageNumber") or item.get("page_number"),
                section_title=item.get("sectionTitle") or item.get("section_title"),
                score=round(float(_score), 4) if isinstance(_score, (int, float)) else None,
                final_rank=item.get("finalRank") or item.get("final_rank"),
            )
        )
    return summaries


def _prompt_trace(message: ChatMessage | None) -> AdminConversationPromptTrace | None:
    if message is None:
        return None
    meta = message.metadata_json if isinstance(message.metadata_json, dict) else {}
    trace = meta.get("promptTrace")
    if not isinstance(trace, dict):
        return None
    system_prompt = trace.get("systemPrompt") or trace.get("system_prompt")
    user_prompt = trace.get("userPrompt") or trace.get("user_prompt")
    if not system_prompt and not user_prompt:
        return None
    return AdminConversationPromptTrace(system_prompt=system_prompt, user_prompt=user_prompt)


def list_conversations_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    from_date_raw: str | None,
    to_date_raw: str | None,
    question_query: str | None,
    answer_status: str | None,
    escalated: bool | None,
    has_citations: bool | None,
    llm_executed: bool | None,
    page: int,
    page_size: int,
) -> AdminConversationsListResponse:
    organization_id = require_institution_organization_id(principal)
    from_date = _parse_datetime_range(from_date_raw)
    to_date = _parse_datetime_range(to_date_raw, end_of_day=True)
    offset = (page - 1) * page_size

    rows, total_count = list_conversations(
        db,
        organization_id=organization_id,
        from_date=from_date,
        to_date=to_date,
        question_query=(question_query.strip() if question_query else None),
        answer_status=(answer_status.strip() if answer_status else None),
        escalated=escalated,
        has_citations=has_citations,
        llm_executed=llm_executed,
        offset=offset,
        limit=page_size,
    )

    items: list[AdminConversationItem] = []
    for session, latest_user, latest_assistant in rows:
        answer_status_key, answer_status_label = _status_meta(latest_assistant)
        citation_count = len(list(latest_assistant.selected_sources or [])) if latest_assistant else 0
        items.append(
            AdminConversationItem(
                session_id=str(session.id),
                chatbot_id=str(session.chatbot_id),
                time=(latest_assistant.created_at if latest_assistant else session.created_at).isoformat(),
                question_preview=_mask_content(latest_user),
                answer_status=answer_status_key,
                answer_status_label=answer_status_label,
                has_citations=citation_count > 0,
                citation_count=citation_count,
                escalated=bool(latest_assistant and (latest_assistant.result_type == "escalate" or latest_assistant.escalation_reason)),
                llm_executed=(bool(latest_assistant.model_name) if latest_assistant else None),
                response_time_ms=(latest_assistant.latency_ms if latest_assistant else None),
                created_at=session.created_at.isoformat(),
                latest_message_at=(session.last_message_at.isoformat() if session.last_message_at else None),
                memo=session.summary_text,
                status=session.status,
            )
        )

    return AdminConversationsListResponse(
        items=items,
        total_count=total_count,
        page=page,
        page_size=page_size,
    )


def get_conversation_detail_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    session_id: str,
) -> AdminConversationDetailResponse:
    organization_id = require_institution_organization_id(principal)
    try:
        UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CONVERSATION_NOT_FOUND") from exc

    row = get_conversation_detail_row(db, organization_id=organization_id, session_id=session_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CONVERSATION_NOT_FOUND")
    session, latest_user, latest_assistant = row
    answer_status_key, answer_status_label = _status_meta(latest_assistant)
    return AdminConversationDetailResponse(
        session_id=str(session.id),
        chatbot_id=str(session.chatbot_id),
        user_question=_mask_content(latest_user),
        assistant_answer=_mask_content(latest_assistant),
        answer_status=answer_status_key,
        answer_status_label=answer_status_label,
        citation_summary=_citation_summary(latest_assistant),
        fallback_message=_fallback_message(latest_assistant),
        escalation_reason=(latest_assistant.escalation_reason if latest_assistant else None),
        escalation_target_department=(latest_assistant.escalation_target_department if latest_assistant else None),
        escalation_target_queue=(latest_assistant.escalation_target_queue if latest_assistant else None),
        response_time_ms=(latest_assistant.latency_ms if latest_assistant else None),
        created_at=session.created_at.isoformat(),
        updated_at=(latest_assistant.updated_at.isoformat() if latest_assistant else session.updated_at.isoformat()),
        memo=session.summary_text,
        session_status=session.status,
        has_citations=bool(latest_assistant and len(list(latest_assistant.selected_sources or [])) > 0),
        llm_executed=(bool(latest_assistant.model_name) if latest_assistant else None),
        advanced_analysis_url=f"/admin/conversation-analysis?sessionId={session_id}",
        prompt_trace=_prompt_trace(latest_assistant),
    )


def patch_conversation_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    session_id: str,
    body: AdminConversationUpdateRequest,
) -> AdminConversationDetailResponse:
    organization_id = require_institution_organization_id(principal)
    try:
        UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CONVERSATION_NOT_FOUND") from exc
    session = get_session_by_id(db, organization_id=organization_id, session_id=session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CONVERSATION_NOT_FOUND")
    if body.status is not None:
        session.status = body.status.strip() or session.status
    if body.memo is not None:
        session.summary_text = body.memo.strip() or None
    db.commit()
    return get_conversation_detail_service(db, principal=principal, session_id=session_id)
