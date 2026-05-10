import uuid
from collections import Counter
from datetime import UTC, date, datetime, timedelta
import re
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import ChatMessage
from app.repositories.admin.operations_repository import (
    average_response_time_seconds,
    count_answered_messages,
    count_chat_sessions,
    count_chatbots,
    count_documents,
    count_documents_by_chatbot,
    count_web_sources_by_chatbot,
    daily_message_counts,
    daily_session_counts,
    get_latest_document_version,
    get_widget_by_chatbot,
    list_chatbots,
    list_documents,
    list_recent_assistant_messages,
    list_user_message_contents_for_range,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.repositories.logs.chat_trace_repository import get_latest_user_question_for_session
from app.repositories.super_admin.chatbots_widgets_repository import (
    create_chatbot,
    get_chatbot_by_org_name,
)
from app.schemas.admin_operations import (
    AdminChatbotCreateRequest,
    AdminChatbotItem,
    AdminChatbotResponse,
    AdminChatbotsListResponse,
    AdminChatbotUpdateRequest,
    AdminDashboardQuestionTypeItem,
    AdminDashboardRecentChatItem,
    AdminDashboardResponse,
    AdminDashboardUsageTrendItem,
    AdminDocumentItem,
    AdminDocumentResponse,
    AdminDocumentsListResponse,
    AdminDocumentUpdateRequest,
    AdminKnowledgeGapItem,
    AdminKnowledgeGapResponse,
    AdminQualityFallbackReasonItem,
    AdminQualityQuestionItem,
    AdminQualityReportResponse,
    AdminRoiDailyTrendItem,
    AdminRoiDashboardResponse,
    AdminRoiTopicItem,
    AdminWidgetResponse,
    AdminWidgetUpdateRequest,
)
from app.services.admin.scope_service import (
    ensure_chatbot_in_scope,
    ensure_document_in_scope,
    require_institution_organization_id,
)
from app.services.limits_service import check_chatbot_limit
from app.services.llm_api_config_runtime_service import (
    inspect_runtime_api_config_status,
    resolve_runtime_api_config,
)
from app.services.settings.answer_settings_service import get_effective_answer_settings_for_runtime
from app.services.widget_install_script import build_widget_install_script

RECOMMENDED_OPENAI_MODELS = {"gpt-4.1-mini", "gpt-4.1"}


def _normalize_quick_reply_hints(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    hints: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        hint = item.strip()
        if not hint:
            continue
        hint = hint[:40]
        if hint in seen:
            continue
        seen.add(hint)
        hints.append(hint)
        if len(hints) >= 5:
            break
    return hints
KNOWLEDGE_GAP_LOW_SCORE_THRESHOLD = 0.35
QUESTION_NORMALIZE_REGEX = re.compile(r"[^0-9A-Za-z가-힣]+")
ROI_SAVED_MINUTES_PER_AUTO_ANSWER = 5
ROI_COST_PER_MINUTE_KRW = 500


def _validate_uuid(value: str, detail: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _normalize_widget_domain(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ALLOWED_DOMAIN")

    parsed = urlparse(normalized if "://" in normalized else f"https://{normalized}")
    hostname = (parsed.hostname or "").strip().lower()
    if not hostname or " " in hostname:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ALLOWED_DOMAIN")
    return hostname


def get_dashboard_summary_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> AdminDashboardResponse:
    organization_id = require_institution_organization_id(principal)

    _ = count_chatbots(db, organization_id=organization_id)
    _ = count_documents(db, organization_id=organization_id)
    total_users = count_chat_sessions(db, organization_id=organization_id)
    total_conversations = total_users
    success_count, total_answer_count = count_answered_messages(db, organization_id=organization_id)
    success_rate = (success_count / total_answer_count * 100.0) if total_answer_count > 0 else 0.0
    avg_response_time = average_response_time_seconds(db, organization_id=organization_id)

    return AdminDashboardResponse(
        total_users=total_users,
        total_conversations=total_conversations,
        success_rate=round(success_rate, 2),
        avg_response_time=round(avg_response_time, 2),
    )


def _parse_date_or_422(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"INVALID_DATE_FORMAT:{field_name}",
        ) from exc


def _normalize_date_range(from_raw: str | None, to_raw: str | None) -> tuple[date, date]:
    today = datetime.now(UTC).date()
    default_from = today - timedelta(days=29)
    from_date = _parse_date_or_422(from_raw, "from") if from_raw else default_from
    to_date = _parse_date_or_422(to_raw, "to") if to_raw else today
    if from_date > to_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_DATE_RANGE")
    if (to_date - from_date).days > 92:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="DATE_RANGE_TOO_LARGE")
    return from_date, to_date


def get_dashboard_usage_trend_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    from_date_raw: str | None,
    to_date_raw: str | None,
) -> list[AdminDashboardUsageTrendItem]:
    organization_id = require_institution_organization_id(principal)
    from_date, to_date = _normalize_date_range(from_date_raw, to_date_raw)
    user_counts = dict(daily_session_counts(db, organization_id=organization_id, from_date=from_date, to_date=to_date))
    message_counts = dict(
        daily_message_counts(db, organization_id=organization_id, from_date=from_date, to_date=to_date),
    )

    items: list[AdminDashboardUsageTrendItem] = []
    cursor = from_date
    while cursor <= to_date:
        items.append(
            AdminDashboardUsageTrendItem(
                date=cursor.isoformat(),
                users=int(user_counts.get(cursor, 0)),
                messages=int(message_counts.get(cursor, 0)),
            )
        )
        cursor += timedelta(days=1)
    return items


def _classify_question_type(content: str) -> str:
    text = content.lower()
    policy_keywords = ["정책", "지원", "보조금", "사업", "대상", "자격"]
    procedure_keywords = ["신청", "절차", "방법", "서류", "제출", "접수"]
    notice_keywords = ["공지", "공고", "마감", "일정", "기간", "변경"]
    contact_keywords = ["연락", "전화", "문의", "담당", "부서", "운영시간"]

    if any(keyword in text for keyword in policy_keywords):
        return "정책 문의"
    if any(keyword in text for keyword in procedure_keywords):
        return "신청/절차"
    if any(keyword in text for keyword in notice_keywords):
        return "공지/일정"
    if any(keyword in text for keyword in contact_keywords):
        return "연락처/운영시간"
    return "기타 문의"


def get_dashboard_question_types_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    from_date_raw: str | None,
    to_date_raw: str | None,
) -> list[AdminDashboardQuestionTypeItem]:
    organization_id = require_institution_organization_id(principal)
    from_date, to_date = _normalize_date_range(from_date_raw, to_date_raw)
    contents = list_user_message_contents_for_range(
        db,
        organization_id=organization_id,
        from_date=from_date,
        to_date=to_date,
    )
    counter = Counter(_classify_question_type(content) for content in contents if content.strip())
    if not counter:
        return [AdminDashboardQuestionTypeItem(label="기타 문의", count=0)]
    return [
        AdminDashboardQuestionTypeItem(label=label, count=count)
        for label, count in counter.most_common()
    ]


def get_dashboard_recent_chats_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    limit: int,
) -> list[AdminDashboardRecentChatItem]:
    organization_id = require_institution_organization_id(principal)
    rows = list_recent_assistant_messages(db, organization_id=organization_id, limit_count=limit)
    items: list[AdminDashboardRecentChatItem] = []
    for row in rows:
        latest_user = get_latest_user_question_for_session(
            db,
            session_id=str(row.session_id),
            before_created_at=row.created_at,
        )
        outcome = (row.result_type or "").lower()
        if outcome == "answered":
            status_value = "success"
        elif outcome == "escalate":
            status_value = "escalation"
        else:
            status_value = "fallback"
        items.append(
            AdminDashboardRecentChatItem(
                created_at=row.created_at.isoformat(),
                question=(latest_user.content if latest_user else None),
                status=status_value,
            )
        )
    return items


def _normalize_quality_date_range(
    start_date_raw: str | None,
    end_date_raw: str | None,
) -> tuple[datetime, datetime]:
    today = datetime.now(UTC).date()
    default_start = today - timedelta(days=29)
    start_date = _parse_date_or_422(start_date_raw, "startDate") if start_date_raw else default_start
    end_date = _parse_date_or_422(end_date_raw, "endDate") if end_date_raw else today
    if start_date > end_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_DATE_RANGE")
    if (end_date - start_date).days > 92:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="DATE_RANGE_TOO_LARGE")
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
    return start_dt, end_dt


def _as_number(value) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _message_top_score(message: ChatMessage) -> float | None:
    scores = [
        _as_number(item.get("combinedScore") or item.get("score"))
        for item in (message.retrieved_documents or [])
        if isinstance(item, dict)
    ]
    valid_scores = [score for score in scores if score is not None]
    return max(valid_scores) if valid_scores else None


def _message_used_in_prompt_count(message: ChatMessage) -> int | None:
    documents = [item for item in (message.retrieved_documents or []) if isinstance(item, dict)]
    if not documents:
        return 0
    return sum(1 for item in documents if bool(item.get("usedInPrompt")))


def _message_fallback_reason(message: ChatMessage) -> str | None:
    if message.result_type == "answered":
        return None
    final_decision = message.final_decision if isinstance(message.final_decision, dict) else {}
    validation = message.validation_signals if isinstance(message.validation_signals, dict) else {}
    reason = (
        message.escalation_reason
        or final_decision.get("reason")
        or validation.get("fallbackReason")
        or validation.get("reason")
        or message.result_type
    )
    return str(reason) if reason else None


def _is_auto_answered_message(message: ChatMessage) -> bool:
    return message.result_type == "answered" and _message_fallback_reason(message) is None


def _is_fallback_or_escalated_message(message: ChatMessage) -> bool:
    if _message_fallback_reason(message) is not None:
        return True
    if message.result_type in {"escalate", "restricted", "conflict", "insufficient_evidence"}:
        return True
    return bool(message.escalation_reason or message.escalation_target_department or message.escalation_target_queue)


def _get_cached_user_message(
    db: Session,
    *,
    message: ChatMessage,
    user_cache: dict[str, ChatMessage | None],
) -> ChatMessage | None:
    session_id = str(message.session_id)
    if session_id not in user_cache:
        user_cache[session_id] = get_latest_user_question_for_session(
            db,
            session_id=session_id,
            before_created_at=message.created_at,
        )
    return user_cache[session_id]


def _message_latency_ms(
    db: Session,
    *,
    message: ChatMessage,
    user_cache: dict[str, ChatMessage | None],
) -> int | None:
    if isinstance(message.latency_ms, int):
        return message.latency_ms
    latest_user = _get_cached_user_message(db, message=message, user_cache=user_cache)
    if latest_user is None:
        return None
    delta = message.created_at - latest_user.created_at
    return max(0, int(delta.total_seconds() * 1000))


def _quality_question_item(
    db: Session,
    *,
    message: ChatMessage,
    user_cache: dict[str, ChatMessage | None],
) -> AdminQualityQuestionItem:
    latest_user = _get_cached_user_message(db, message=message, user_cache=user_cache)
    selected_sources = [item for item in (message.selected_sources or []) if isinstance(item, dict)]
    return AdminQualityQuestionItem(
        created_at=message.created_at.isoformat(),
        chatbot_id=str(message.chatbot_id),
        question=latest_user.content if latest_user else None,
        answer=message.content,
        outcome=message.result_type,
        fallback_reason=_message_fallback_reason(message),
        top_score=_message_top_score(message),
        retrieved_count=len(message.retrieved_documents or []),
        used_in_prompt_count=_message_used_in_prompt_count(message),
        llm_executed=bool(message.model_name),
        citation_count=len(selected_sources),
        latency_ms=_message_latency_ms(db, message=message, user_cache=user_cache),
    )


def get_quality_report_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str | None,
    start_date_raw: str | None,
    end_date_raw: str | None,
    fallback_only: bool,
) -> AdminQualityReportResponse:
    organization_id = require_institution_organization_id(principal)
    if chatbot_id:
        chatbot_id = _validate_uuid(chatbot_id, "CHATBOT_NOT_FOUND")
        ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    start_dt, end_dt = _normalize_quality_date_range(start_date_raw, end_date_raw)
    stmt = select(ChatMessage).where(
        ChatMessage.organization_id == organization_id,
        ChatMessage.role == "assistant",
        ChatMessage.is_test.is_(False),
        ChatMessage.created_at >= start_dt,
        ChatMessage.created_at < end_dt,
    )
    if chatbot_id:
        stmt = stmt.where(ChatMessage.chatbot_id == chatbot_id)
    if fallback_only:
        stmt = stmt.where(ChatMessage.result_type != "answered")
    stmt = stmt.order_by(ChatMessage.created_at.desc()).limit(5000)
    rows = list(db.execute(stmt).scalars().all())

    total = len(rows)
    answered_count = sum(1 for row in rows if row.result_type == "answered")
    fallback_count = total - answered_count
    top_scores = [score for row in rows if (score := _message_top_score(row)) is not None]
    retrieved_counts = [len(row.retrieved_documents or []) for row in rows]
    used_counts = [
        count
        for row in rows
        if (count := _message_used_in_prompt_count(row)) is not None
    ]
    user_cache: dict[str, ChatMessage | None] = {}
    latencies = [
        latency
        for row in rows
        if (latency := _message_latency_ms(db, message=row, user_cache=user_cache)) is not None
    ]
    llm_executed_count = sum(1 for row in rows if row.model_name)

    reason_counter: Counter[str] = Counter()
    for row in rows:
        reason = _message_fallback_reason(row)
        if reason:
            reason_counter[reason] += 1

    failed_rows = [row for row in rows if row.result_type != "answered"][:10]
    low_score_rows = [
        row
        for row in rows
        if row.result_type == "answered"
        and (score := _message_top_score(row)) is not None
        and score < 0.4
    ][:10]
    no_citation_rows = [
        row
        for row in rows
        if row.result_type == "answered" and not (row.selected_sources or [])
    ][:10]

    return AdminQualityReportResponse(
        total_conversations=total,
        answered_count=answered_count,
        fallback_count=fallback_count,
        fallback_rate=round((fallback_count / total * 100.0) if total else 0.0, 2),
        avg_latency_ms=round(sum(latencies) / len(latencies), 2) if latencies else None,
        avg_top_score=round(sum(top_scores) / len(top_scores), 4) if top_scores else None,
        avg_retrieved_count=round(sum(retrieved_counts) / len(retrieved_counts), 2) if retrieved_counts else None,
        avg_used_in_prompt_count=round(sum(used_counts) / len(used_counts), 2) if used_counts else None,
        llm_executed_rate=round((llm_executed_count / total * 100.0) if total else 0.0, 2),
        top_fallback_reasons=[
            AdminQualityFallbackReasonItem(reason=reason, count=count)
            for reason, count in reason_counter.most_common(10)
        ],
        recent_failed_questions=[
            _quality_question_item(db, message=row, user_cache=user_cache)
            for row in failed_rows
        ],
        low_score_questions=[
            _quality_question_item(db, message=row, user_cache=user_cache)
            for row in low_score_rows
        ],
        no_citation_answers=[
            _quality_question_item(db, message=row, user_cache=user_cache)
            for row in no_citation_rows
        ],
    )


def _normalize_gap_question(value: str) -> str:
    normalized = QUESTION_NORMALIZE_REGEX.sub(" ", value.strip().lower())
    return " ".join(normalized.split())


def _recommend_knowledge_topic(question: str) -> str:
    text = question.lower()
    has_loan = any(term in text for term in ["융자", "대출", "자금", "금리", "담보", "자부담"])
    if has_loan and any(term in text for term in ["자격", "대상", "누구"]):
        return "융자지원 자격 요건"
    if has_loan and any(term in text for term in ["조건", "기준"]):
        return "융자지원 조건"
    if has_loan and any(term in text for term in ["서류", "신청서", "제출"]):
        return "융자지원 신청 서류"
    if has_loan and any(term in text for term in ["금리", "이자", "상환"]):
        return "융자지원 금리 및 상환 조건"
    if has_loan:
        return "융자지원 안내"
    if any(term in text for term in ["사업신고", "신고", "변경신고"]):
        return "해외농업자원개발 사업신고 절차"
    if any(term in text for term in ["국내반입", "반입"]):
        return "해외농산물 국내반입 안내"
    if any(term in text for term in ["투자촉진", "투자"]):
        return "해외농업 투자촉진 지원"
    if any(term in text for term in ["해외인턴", "인턴"]):
        return "해외인턴 지원 자격 및 신청"
    if any(term in text for term in ["교육", "국제곡물", "전문가"]):
        return "교육 프로그램 신청 안내"
    if any(term in text for term in ["문의", "연락처", "전화", "담당"]):
        return "사업별 문의처 및 담당부서"
    tokens = _normalize_gap_question(question).split()
    topic = " ".join(tokens[:4]).strip()
    return f"{topic} 관련 안내" if topic else "미분류 지식 보강"


def _gap_item_from_group(group: dict) -> AdminKnowledgeGapItem:
    scores = [score for score in group["top_scores"] if score is not None]
    avg_top_score = round(sum(scores) / len(scores), 4) if scores else None
    return AdminKnowledgeGapItem(
        question=group["question"],
        count=group["count"],
        fallback_count=group["fallback_count"],
        avg_top_score=avg_top_score,
        last_asked_at=group["last_asked_at"].isoformat(),
        recommended_action="knowledge_update",
        recommended_topic=_recommend_knowledge_topic(group["question"]),
    )


def get_knowledge_gap_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str | None,
    start_date_raw: str | None,
    end_date_raw: str | None,
) -> AdminKnowledgeGapResponse:
    organization_id = require_institution_organization_id(principal)
    if chatbot_id:
        chatbot_id = _validate_uuid(chatbot_id, "CHATBOT_NOT_FOUND")
        ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    start_dt, end_dt = _normalize_quality_date_range(start_date_raw, end_date_raw)
    stmt = select(ChatMessage).where(
        ChatMessage.organization_id == organization_id,
        ChatMessage.role == "assistant",
        ChatMessage.is_test.is_(False),
        ChatMessage.created_at >= start_dt,
        ChatMessage.created_at < end_dt,
    )
    if chatbot_id:
        stmt = stmt.where(ChatMessage.chatbot_id == chatbot_id)
    stmt = stmt.order_by(ChatMessage.created_at.desc()).limit(5000)
    rows = list(db.execute(stmt).scalars().all())

    user_cache: dict[str, ChatMessage | None] = {}
    groups: dict[str, dict] = {}
    fallback_keys: set[str] = set()
    low_score_keys: set[str] = set()
    prompt_gap_keys: set[str] = set()

    for row in rows:
        latest_user = _get_cached_user_message(db, message=row, user_cache=user_cache)
        if latest_user is None or not latest_user.content.strip():
            continue
        question = latest_user.content.strip()
        group_key = _normalize_gap_question(question)
        if not group_key:
            continue

        fallback_reason = _message_fallback_reason(row)
        top_score = _message_top_score(row)
        used_in_prompt_count = _message_used_in_prompt_count(row)
        is_fallback_gap = bool(fallback_reason and fallback_reason != "NONE")
        is_low_score_gap = top_score is not None and top_score < KNOWLEDGE_GAP_LOW_SCORE_THRESHOLD
        is_prompt_gap = used_in_prompt_count == 0
        if not (is_fallback_gap or is_low_score_gap or is_prompt_gap):
            continue

        group = groups.setdefault(
            group_key,
            {
                "question": question,
                "count": 0,
                "fallback_count": 0,
                "top_scores": [],
                "last_asked_at": row.created_at,
            },
        )
        group["count"] += 1
        if is_fallback_gap:
            group["fallback_count"] += 1
            fallback_keys.add(group_key)
        if is_low_score_gap:
            low_score_keys.add(group_key)
        if is_prompt_gap:
            prompt_gap_keys.add(group_key)
        if top_score is not None:
            group["top_scores"].append(top_score)
        if row.created_at > group["last_asked_at"]:
            group["last_asked_at"] = row.created_at

    def sorted_items(keys: set[str] | None = None, *, repeated_only: bool = False) -> list[AdminKnowledgeGapItem]:
        selected = [
            group
            for key, group in groups.items()
            if (keys is None or key in keys) and (not repeated_only or group["count"] >= 2)
        ]
        selected.sort(key=lambda item: (item["count"], item["fallback_count"], item["last_asked_at"]), reverse=True)
        return [_gap_item_from_group(group) for group in selected[:20]]

    suggested_keys = fallback_keys | low_score_keys | prompt_gap_keys
    return AdminKnowledgeGapResponse(
        total_analyzed=len(rows),
        fallback_questions=sorted_items(fallback_keys),
        low_score_questions=sorted_items(low_score_keys),
        repeated_questions=sorted_items(repeated_only=True),
        suggested_knowledge_topics=sorted_items(suggested_keys),
    )


def _classify_roi_topic(question: str | None) -> str:
    text = (question or "").lower()
    if "융자" in text or "금리" in text or "담보" in text or "자부담" in text:
        return "융자"
    if "사업신고" in text or "변경신고" in text or "신고" in text:
        return "사업신고"
    if "해외인턴" in text or "인턴" in text:
        return "해외인턴"
    if "교육" in text or "국제곡물" in text or "전문가" in text:
        return "교육"
    if "투자촉진" in text or "투자" in text:
        return "투자촉진"
    if "국내반입" in text or "반입" in text:
        return "국내반입"
    return "기타"


def _normalize_roi_date_range(
    start_date_raw: str | None,
    end_date_raw: str | None,
) -> tuple[date, date, datetime, datetime]:
    today = datetime.now(UTC).date()
    default_start = today - timedelta(days=29)
    start_date = _parse_date_or_422(start_date_raw, "startDate") if start_date_raw else default_start
    end_date = _parse_date_or_422(end_date_raw, "endDate") if end_date_raw else today
    if start_date > end_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_DATE_RANGE")
    if (end_date - start_date).days > 92:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="DATE_RANGE_TOO_LARGE")
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
    return start_date, end_date, start_dt, end_dt


def get_roi_dashboard_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str | None,
    start_date_raw: str | None,
    end_date_raw: str | None,
) -> AdminRoiDashboardResponse:
    organization_id = require_institution_organization_id(principal)
    if chatbot_id:
        chatbot_id = _validate_uuid(chatbot_id, "CHATBOT_NOT_FOUND")
        ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    start_date, end_date, start_dt, end_dt = _normalize_roi_date_range(start_date_raw, end_date_raw)
    stmt = select(ChatMessage).where(
        ChatMessage.organization_id == organization_id,
        ChatMessage.role == "assistant",
        ChatMessage.is_test.is_(False),
        ChatMessage.created_at >= start_dt,
        ChatMessage.created_at < end_dt,
    )
    if chatbot_id:
        stmt = stmt.where(ChatMessage.chatbot_id == chatbot_id)
    stmt = stmt.order_by(ChatMessage.created_at.desc()).limit(5000)
    rows = list(db.execute(stmt).scalars().all())

    user_cache: dict[str, ChatMessage | None] = {}
    auto_answered_count = 0
    fallback_count = 0
    automated_topics: Counter[str] = Counter()
    escalated_topics: Counter[str] = Counter()
    daily_counts: dict[date, dict[str, int]] = {}
    latencies: list[int] = []

    cursor = start_date
    while cursor <= end_date:
        daily_counts[cursor] = {"answered": 0, "fallback": 0}
        cursor += timedelta(days=1)

    for row in rows:
        latest_user = _get_cached_user_message(db, message=row, user_cache=user_cache)
        question = latest_user.content if latest_user else None
        topic = _classify_roi_topic(question)
        latency = _message_latency_ms(db, message=row, user_cache=user_cache)
        if latency is not None:
            latencies.append(latency)
        day = row.created_at.date()
        day_bucket = daily_counts.setdefault(day, {"answered": 0, "fallback": 0})

        if _is_auto_answered_message(row):
            auto_answered_count += 1
            automated_topics[topic] += 1
            day_bucket["answered"] += 1
        elif _is_fallback_or_escalated_message(row):
            fallback_count += 1
            escalated_topics[topic] += 1
            day_bucket["fallback"] += 1

    total_questions = len(rows)
    estimated_saved_minutes = auto_answered_count * ROI_SAVED_MINUTES_PER_AUTO_ANSWER
    daily_trend: list[AdminRoiDailyTrendItem] = []
    cursor = start_date
    while cursor <= end_date:
        counts = daily_counts.get(cursor, {"answered": 0, "fallback": 0})
        total = counts["answered"] + counts["fallback"]
        daily_trend.append(
            AdminRoiDailyTrendItem(
                date=cursor.isoformat(),
                answered=counts["answered"],
                fallback=counts["fallback"],
                auto_resolution_rate=round((counts["answered"] / total * 100.0) if total else 0.0, 2),
            )
        )
        cursor += timedelta(days=1)

    return AdminRoiDashboardResponse(
        total_questions=total_questions,
        auto_answered_count=auto_answered_count,
        fallback_count=fallback_count,
        auto_resolution_rate=round((auto_answered_count / total_questions * 100.0) if total_questions else 0.0, 2),
        avg_latency_ms=round(sum(latencies) / len(latencies), 2) if latencies else None,
        estimated_saved_minutes=estimated_saved_minutes,
        estimated_saved_cost=estimated_saved_minutes * ROI_COST_PER_MINUTE_KRW,
        top_automated_topics=[
            AdminRoiTopicItem(topic=topic, count=count)
            for topic, count in automated_topics.most_common(10)
        ],
        top_escalated_topics=[
            AdminRoiTopicItem(topic=topic, count=count)
            for topic, count in escalated_topics.most_common(10)
        ],
        daily_trend=daily_trend,
    )


def list_documents_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    query: str | None,
    status_filter: str | None,
) -> AdminDocumentsListResponse:
    organization_id = require_institution_organization_id(principal)

    rows = list_documents(
        db,
        organization_id=organization_id,
        query=(query.strip() if query else None),
        status=(status_filter.strip() if status_filter else None),
    )
    items = []
    for doc, latest_version in rows:
        items.append(
            AdminDocumentItem(
                id=str(doc.id),
                chatbot_id=str(doc.chatbot_id),
                title=doc.title,
                status=doc.status,
                source_type=(latest_version.source_type if latest_version else None),
                latest_version_number=(latest_version.version_number if latest_version else None),
                latest_version_status=(latest_version.status if latest_version else None),
                updated_at=doc.updated_at.isoformat(),
                created_at=doc.created_at.isoformat(),
            )
        )
    return AdminDocumentsListResponse(items=items)


def patch_document_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    document_id: str,
    body: AdminDocumentUpdateRequest,
) -> AdminDocumentResponse:
    organization_id = require_institution_organization_id(principal)
    document_id = _validate_uuid(document_id, "DOCUMENT_NOT_FOUND")
    doc = ensure_document_in_scope(db, principal=principal, document_id=document_id)
    doc.status = body.status
    db.commit()
    db.refresh(doc)
    latest = get_latest_document_version(db, organization_id=organization_id, document_id=document_id)
    return AdminDocumentResponse(
        id=str(doc.id),
        chatbot_id=str(doc.chatbot_id),
        title=doc.title,
        status=doc.status,
        source_type=(latest.source_type if latest else None),
        latest_version_number=(latest.version_number if latest else None),
        latest_version_status=(latest.status if latest else None),
        updated_at=doc.updated_at.isoformat(),
        created_at=doc.created_at.isoformat(),
    )


def delete_document_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    document_id: str,
) -> None:
    require_institution_organization_id(principal)
    document_id = _validate_uuid(document_id, "DOCUMENT_NOT_FOUND")
    doc = ensure_document_in_scope(db, principal=principal, document_id=document_id)
    doc.deleted_at = datetime.now(UTC)
    doc.status = "deprecated"
    db.commit()


def list_chatbots_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> AdminChatbotsListResponse:
    organization_id = require_institution_organization_id(principal)

    rows = list_chatbots(db, organization_id=organization_id)
    items = [
        AdminChatbotItem(
            id=str(row.id),
            name=row.name,
            status=row.status,
            organization_id=str(row.organization_id),
            skip_duplicate_file_reindex=row.skip_duplicate_file_reindex,
            document_count=count_documents_by_chatbot(
                db,
                organization_id=organization_id,
                chatbot_id=str(row.id),
            ),
            website_count=count_web_sources_by_chatbot(
                db,
                organization_id=organization_id,
                chatbot_id=str(row.id),
            ),
            created_at=row.created_at.isoformat(),
            updated_at=row.updated_at.isoformat(),
        )
        for row in rows
    ]
    return AdminChatbotsListResponse(items=items)


def get_chatbot_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> AdminChatbotResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot_id = _validate_uuid(chatbot_id, "CHATBOT_NOT_FOUND")
    row = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    return AdminChatbotResponse(
        id=str(row.id),
        name=row.name,
        status=row.status,
        organization_id=str(row.organization_id),
        tone=row.tone,
        answer_length=row.answer_length,
        citation_mode=row.citation_mode,
        web_search_enabled=row.web_search_enabled,
        skip_duplicate_file_reindex=row.skip_duplicate_file_reindex,
        welcome_message=row.welcome_message,
        quick_reply_hints=_normalize_quick_reply_hints(row.quick_reply_hints),
        fallback_message=row.fallback_message,
        description_text=row.description_text,
        theme=row.theme or {},
        business_hours=row.business_hours or {},
        escalation_policy=row.escalation_policy or {},
        document_count=count_documents_by_chatbot(
            db,
            organization_id=organization_id,
            chatbot_id=str(row.id),
        ),
        website_count=count_web_sources_by_chatbot(
            db,
            organization_id=organization_id,
            chatbot_id=str(row.id),
        ),
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def create_chatbot_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: AdminChatbotCreateRequest,
) -> AdminChatbotResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot_name = body.name.strip()
    if not chatbot_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CHATBOT_NAME_REQUIRED")

    description_text = body.description_text.strip() if isinstance(body.description_text, str) else None
    if description_text == "":
        description_text = None

    duplicated = get_chatbot_by_org_name(db, organization_id=organization_id, name=chatbot_name)
    if duplicated is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="CHATBOT_NAME_CONFLICT")

    check_chatbot_limit(db, organization_id=organization_id, admin_id=principal.admin_id)

    row = create_chatbot(
        db,
        organization_id=organization_id,
        name=chatbot_name,
        description_text=description_text,
        status="active",
    )

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.chatbot.create",
        target_type="chatbot",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "name": row.name,
            "status": row.status,
        },
    )
    db.commit()
    db.refresh(row)
    return AdminChatbotResponse(
        id=str(row.id),
        name=row.name,
        status=row.status,
        organization_id=str(row.organization_id),
        tone=row.tone,
        answer_length=row.answer_length,
        citation_mode=row.citation_mode,
        web_search_enabled=row.web_search_enabled,
        skip_duplicate_file_reindex=row.skip_duplicate_file_reindex,
        welcome_message=row.welcome_message,
        quick_reply_hints=_normalize_quick_reply_hints(row.quick_reply_hints),
        fallback_message=row.fallback_message,
        description_text=row.description_text,
        theme=row.theme or {},
        business_hours=row.business_hours or {},
        escalation_policy=row.escalation_policy or {},
        document_count=0,
        website_count=0,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def patch_chatbot_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: AdminChatbotUpdateRequest,
) -> AdminChatbotResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot_id = _validate_uuid(chatbot_id, "CHATBOT_NOT_FOUND")
    row = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    if body.name is not None:
        row.name = body.name
    if body.status is not None:
        row.status = body.status
    if body.tone is not None:
        row.tone = body.tone
    if body.answer_length is not None:
        row.answer_length = body.answer_length
    if body.citation_mode is not None:
        row.citation_mode = body.citation_mode
    if body.web_search_enabled is not None:
        row.web_search_enabled = body.web_search_enabled
    if body.skip_duplicate_file_reindex is not None:
        row.skip_duplicate_file_reindex = body.skip_duplicate_file_reindex
    if body.welcome_message is not None:
        row.welcome_message = body.welcome_message
    if body.quick_reply_hints is not None:
        row.quick_reply_hints = _normalize_quick_reply_hints(body.quick_reply_hints)
    if body.fallback_message is not None:
        row.fallback_message = body.fallback_message
    if body.description_text is not None:
        row.description_text = body.description_text
    if body.theme is not None:
        row.theme = body.theme
    if body.business_hours is not None:
        row.business_hours = body.business_hours
    if body.escalation_policy is not None:
        row.escalation_policy = body.escalation_policy

    db.commit()
    db.refresh(row)
    return AdminChatbotResponse(
        id=str(row.id),
        name=row.name,
        status=row.status,
        organization_id=str(row.organization_id),
        tone=row.tone,
        answer_length=row.answer_length,
        citation_mode=row.citation_mode,
        web_search_enabled=row.web_search_enabled,
        skip_duplicate_file_reindex=row.skip_duplicate_file_reindex,
        welcome_message=row.welcome_message,
        quick_reply_hints=_normalize_quick_reply_hints(row.quick_reply_hints),
        fallback_message=row.fallback_message,
        description_text=row.description_text,
        theme=row.theme or {},
        business_hours=row.business_hours or {},
        escalation_policy=row.escalation_policy or {},
        document_count=count_documents_by_chatbot(
            db,
            organization_id=organization_id,
            chatbot_id=str(row.id),
        ),
        website_count=count_web_sources_by_chatbot(
            db,
            organization_id=organization_id,
            chatbot_id=str(row.id),
        ),
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def get_widget_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> AdminWidgetResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot_id = _validate_uuid(chatbot_id, "CHATBOT_NOT_FOUND")
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    widget = get_widget_by_chatbot(db, organization_id=organization_id, chatbot_id=chatbot_id)
    if widget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WIDGET_NOT_FOUND")

    chatbot = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    theme = chatbot.theme if isinstance(chatbot.theme, dict) else {}
    install_script = build_widget_install_script(
        chatbot_id=str(widget.chatbot_id),
        launcher_label=widget.launcher_label,
        launcher_icon=theme.get("widgetLauncherIcon") if isinstance(theme.get("widgetLauncherIcon"), str) else None,
        launcher_icon_url=theme.get("widgetLauncherIconUrl") if isinstance(theme.get("widgetLauncherIconUrl"), str) else None,
    )
    runtime_api = resolve_runtime_api_config(db)
    answer_settings = get_effective_answer_settings_for_runtime(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )
    runtime_provider = runtime_api.provider if runtime_api is not None else None
    runtime_model = answer_settings.model_runtime.model_name or (
        runtime_api.default_model if runtime_api is not None else None
    )
    runtime_source = runtime_api.source if runtime_api is not None else None
    runtime_status = inspect_runtime_api_config_status(db)
    runtime_model_recommended = (
        runtime_provider == "openai" and str(runtime_model or "").strip() in RECOMMENDED_OPENAI_MODELS
    )
    install_script = build_widget_install_script(
        chatbot_id=str(widget.chatbot_id),
        launcher_label=widget.launcher_label,
        launcher_icon=theme.get("widgetLauncherIcon") if isinstance(theme.get("widgetLauncherIcon"), str) else None,
        launcher_icon_url=theme.get("widgetLauncherIconUrl") if isinstance(theme.get("widgetLauncherIconUrl"), str) else None,
    )
    return AdminWidgetResponse(
        id=str(widget.id),
        chatbot_id=str(widget.chatbot_id),
        organization_id=str(widget.organization_id),
        allowed_domains=list(widget.allowed_domains or []),
        status=widget.status,
        is_active=(widget.status == "active"),
        theme_color=widget.theme_color,
        position=widget.position,
        launcher_label=widget.launcher_label,
        welcome_message=widget.welcome_message,
        chatbot_display_name=(
            theme.get("widgetChatbotName") if isinstance(theme.get("widgetChatbotName"), str) else None
        ),
        institution_name=theme.get("widgetInstitutionName") if isinstance(theme.get("widgetInstitutionName"), str) else None,
        logo_url=theme.get("widgetLogoUrl") if isinstance(theme.get("widgetLogoUrl"), str) else None,
        intro_message=theme.get("widgetIntroMessage") if isinstance(theme.get("widgetIntroMessage"), str) else None,
        color_preset=theme.get("widgetColorPreset") if isinstance(theme.get("widgetColorPreset"), str) else None,
        launcher_icon=theme.get("widgetLauncherIcon") if isinstance(theme.get("widgetLauncherIcon"), str) else None,
        launcher_icon_url=(
            theme.get("widgetLauncherIconUrl") if isinstance(theme.get("widgetLauncherIconUrl"), str) else None
        ),
        launcher_hover_message=(
            theme.get("widgetLauncherHoverMessage")
            if isinstance(theme.get("widgetLauncherHoverMessage"), str)
            else None
        ),
        banner_title=theme.get("widgetBannerTitle") if isinstance(theme.get("widgetBannerTitle"), str) else None,
        banner_description=(
            theme.get("widgetBannerDescription") if isinstance(theme.get("widgetBannerDescription"), str) else None
        ),
        starter_questions=[
            item.strip()
            for item in theme.get("widgetStarterQuestions", [])
            if isinstance(item, str) and item.strip()
        ]
        if isinstance(theme.get("widgetStarterQuestions"), list)
        else [],
        runtime_provider=runtime_provider,
        runtime_model=runtime_model,
        runtime_source=runtime_source,
        runtime_key_status=runtime_status.status,
        runtime_key_detail=runtime_status.detail,
        runtime_secret_configured=runtime_status.secret_configured,
        runtime_model_recommended=runtime_model_recommended,
        install_script=install_script,
        created_at=widget.created_at.isoformat(),
        updated_at=widget.updated_at.isoformat(),
    )


def patch_widget_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: AdminWidgetUpdateRequest,
) -> AdminWidgetResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot_id = _validate_uuid(chatbot_id, "CHATBOT_NOT_FOUND")
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    widget = get_widget_by_chatbot(db, organization_id=organization_id, chatbot_id=chatbot_id)
    if widget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WIDGET_NOT_FOUND")

    if body.allowed_domains is not None:
        normalized = [_normalize_widget_domain(item) for item in body.allowed_domains if item and item.strip()]
        widget.allowed_domains = normalized
    if body.is_active is not None:
        widget.status = "active" if body.is_active else "inactive"
    if body.theme_color is not None:
        widget.theme_color = body.theme_color.strip() or None
    if body.launcher_label is not None:
        widget.launcher_label = body.launcher_label.strip() or None
    if body.welcome_message is not None:
        widget.welcome_message = body.welcome_message.strip() or None
    chatbot = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    theme = dict(chatbot.theme or {}) if isinstance(chatbot.theme, dict) else {}
    if body.chatbot_display_name is not None:
        theme["widgetChatbotName"] = body.chatbot_display_name.strip() or None
    if body.institution_name is not None:
        theme["widgetInstitutionName"] = body.institution_name.strip() or None
    if body.logo_url is not None:
        theme["widgetLogoUrl"] = body.logo_url.strip() or None
    if body.intro_message is not None:
        theme["widgetIntroMessage"] = body.intro_message.strip() or None
    if body.color_preset is not None:
        theme["widgetColorPreset"] = body.color_preset.strip() or None
    if body.launcher_icon is not None:
        theme["widgetLauncherIcon"] = body.launcher_icon.strip() or None
    if body.launcher_icon_url is not None:
        theme["widgetLauncherIconUrl"] = body.launcher_icon_url.strip() or None
    if body.launcher_hover_message is not None:
        theme["widgetLauncherHoverMessage"] = body.launcher_hover_message.strip() or None
    if body.banner_title is not None:
        theme["widgetBannerTitle"] = body.banner_title.strip() or None
    if body.banner_description is not None:
        theme["widgetBannerDescription"] = body.banner_description.strip() or None
    if body.starter_questions is not None:
        theme["widgetStarterQuestions"] = [item.strip() for item in body.starter_questions if item and item.strip()]
    chatbot.theme = theme
    db.commit()
    db.refresh(widget)
    runtime_api = resolve_runtime_api_config(db)
    answer_settings = get_effective_answer_settings_for_runtime(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )
    runtime_provider = runtime_api.provider if runtime_api is not None else None
    runtime_model = answer_settings.model_runtime.model_name or (
        runtime_api.default_model if runtime_api is not None else None
    )
    runtime_source = runtime_api.source if runtime_api is not None else None
    runtime_status = inspect_runtime_api_config_status(db)
    runtime_model_recommended = (
        runtime_provider == "openai" and str(runtime_model or "").strip() in RECOMMENDED_OPENAI_MODELS
    )
    install_script = build_widget_install_script(
        chatbot_id=str(widget.chatbot_id),
        launcher_label=widget.launcher_label,
        launcher_icon=theme.get("widgetLauncherIcon") if isinstance(theme.get("widgetLauncherIcon"), str) else None,
        launcher_icon_url=theme.get("widgetLauncherIconUrl") if isinstance(theme.get("widgetLauncherIconUrl"), str) else None,
    )
    return AdminWidgetResponse(
        id=str(widget.id),
        chatbot_id=str(widget.chatbot_id),
        organization_id=str(widget.organization_id),
        allowed_domains=list(widget.allowed_domains or []),
        status=widget.status,
        is_active=(widget.status == "active"),
        theme_color=widget.theme_color,
        position=widget.position,
        launcher_label=widget.launcher_label,
        welcome_message=widget.welcome_message,
        chatbot_display_name=(
            theme.get("widgetChatbotName") if isinstance(theme.get("widgetChatbotName"), str) else None
        ),
        institution_name=theme.get("widgetInstitutionName") if isinstance(theme.get("widgetInstitutionName"), str) else None,
        logo_url=theme.get("widgetLogoUrl") if isinstance(theme.get("widgetLogoUrl"), str) else None,
        intro_message=theme.get("widgetIntroMessage") if isinstance(theme.get("widgetIntroMessage"), str) else None,
        color_preset=theme.get("widgetColorPreset") if isinstance(theme.get("widgetColorPreset"), str) else None,
        launcher_icon=theme.get("widgetLauncherIcon") if isinstance(theme.get("widgetLauncherIcon"), str) else None,
        launcher_icon_url=(
            theme.get("widgetLauncherIconUrl") if isinstance(theme.get("widgetLauncherIconUrl"), str) else None
        ),
        launcher_hover_message=(
            theme.get("widgetLauncherHoverMessage")
            if isinstance(theme.get("widgetLauncherHoverMessage"), str)
            else None
        ),
        banner_title=theme.get("widgetBannerTitle") if isinstance(theme.get("widgetBannerTitle"), str) else None,
        banner_description=(
            theme.get("widgetBannerDescription") if isinstance(theme.get("widgetBannerDescription"), str) else None
        ),
        starter_questions=[
            item.strip()
            for item in theme.get("widgetStarterQuestions", [])
            if isinstance(item, str) and item.strip()
        ]
        if isinstance(theme.get("widgetStarterQuestions"), list)
        else [],
        runtime_provider=runtime_provider,
        runtime_model=runtime_model,
        runtime_source=runtime_source,
        runtime_key_status=runtime_status.status,
        runtime_key_detail=runtime_status.detail,
        runtime_secret_configured=runtime_status.secret_configured,
        runtime_model_recommended=runtime_model_recommended,
        install_script=install_script,
        created_at=widget.created_at.isoformat(),
        updated_at=widget.updated_at.isoformat(),
    )
