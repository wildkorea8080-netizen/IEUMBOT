from datetime import UTC, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.repositories.admin.usage_repository import (
    count_active_chatbots,
    count_active_widgets,
    count_chatbots_all,
    count_monthly_conversations,
    count_total_conversations,
    count_widgets_all,
    get_active_contract,
    get_chatbot_conversation_counts,
    get_chatbot_message_stats,
    get_daily_conversation_counts,
    list_org_chatbots,
)
from app.schemas.usage import (
    AdminChatbotUsageItem,
    AdminChatbotUsageResponse,
    AdminUsageDailyItem,
    AdminUsageDailyResponse,
    AdminUsageLimitStatus,
    AdminUsageSummaryResponse,
)
from app.services.admin.scope_service import require_institution_organization_id


def _parse_date(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        parsed_date = datetime.fromisoformat(value).date()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_DATE_FORMAT") from exc
    return datetime.combine(parsed_date, time.max if end_of_day else time.min, tzinfo=UTC)


def _month_range() -> tuple[datetime, datetime]:
    now = datetime.now(UTC)
    month_start = datetime(now.year, now.month, 1, tzinfo=UTC)
    if now.month == 12:
        next_month = datetime(now.year + 1, 1, 1, tzinfo=UTC)
    else:
        next_month = datetime(now.year, now.month + 1, 1, tzinfo=UTC)
    return month_start, next_month


def _range_for_type(range_type: str | None, from_raw: str | None, to_raw: str | None) -> tuple[str, datetime, datetime]:
    now = datetime.now(UTC)
    normalized = (range_type or "30d").lower()
    if normalized == "custom":
        from_date = _parse_date(from_raw)
        to_date = _parse_date(to_raw)
        if from_date is None or to_date is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CUSTOM_RANGE_REQUIRED")
        if from_date > to_date:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_DATE_RANGE")
        return normalized, from_date, to_date

    days = 7 if normalized == "7d" else 30
    to_date = datetime.combine(now.date(), time.min, tzinfo=UTC)
    from_date = to_date - timedelta(days=days - 1)
    return ("7d" if normalized == "7d" else "30d"), from_date, to_date


def _to_percent(numerator: int, denominator: int | None) -> float | None:
    if not denominator or denominator <= 0:
        return None
    return round((numerator / denominator) * 100, 1)


def _limit_status(label: str, key: str, used: int, limit: int | None) -> AdminUsageLimitStatus:
    usage_rate = _to_percent(used, limit)
    if limit is None:
        status = "normal"
        status_label = "정상"
    elif used >= limit:
        status = "exceeded"
        status_label = "초과"
    elif usage_rate is not None and usage_rate >= 80:
        status = "warning"
        status_label = "임박"
    else:
        status = "normal"
        status_label = "정상"
    return AdminUsageLimitStatus(
        key=key,
        label=label,
        used=used,
        limit=limit,
        usage_rate=usage_rate,
        status=status,
        status_label=status_label,
    )


def get_usage_summary_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> AdminUsageSummaryResponse:
    organization_id = require_institution_organization_id(principal)
    month_start, next_month_start = _month_range()
    contract = get_active_contract(db, organization_id=organization_id)

    total_conversations = count_total_conversations(db, organization_id=organization_id)
    monthly_usage = count_monthly_conversations(
        db,
        organization_id=organization_id,
        month_start=month_start,
        next_month_start=next_month_start,
    )
    active_chatbots = count_active_chatbots(db, organization_id=organization_id)
    active_widgets = count_active_widgets(db, organization_id=organization_id)
    chatbot_total = count_chatbots_all(db, organization_id=organization_id)
    widget_total = count_widgets_all(db, organization_id=organization_id)

    chatbot_limit = contract.chatbot_limit if contract else None
    widget_limit = contract.widget_limit if contract else None
    monthly_limit = contract.monthly_conversation_limit if contract else None

    return AdminUsageSummaryResponse(
        total_conversations=total_conversations,
        monthly_usage=monthly_usage,
        monthly_limit=monthly_limit,
        monthly_usage_rate=_to_percent(monthly_usage, monthly_limit),
        active_chatbots=active_chatbots,
        active_widgets=active_widgets,
        limits=[
            _limit_status("챗봇 수", "chatbot_limit", chatbot_total, chatbot_limit),
            _limit_status("위젯 수", "widget_limit", widget_total, widget_limit),
            _limit_status("월 대화 수", "monthly_conversation_limit", monthly_usage, monthly_limit),
        ],
    )


def get_usage_daily_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    range_type: str | None,
    from_raw: str | None,
    to_raw: str | None,
) -> AdminUsageDailyResponse:
    organization_id = require_institution_organization_id(principal)
    normalized_range, from_date, to_date = _range_for_type(range_type, from_raw, to_raw)
    rows = get_daily_conversation_counts(
        db,
        organization_id=organization_id,
        from_date=from_date,
        to_date=to_date,
    )
    row_map = {
        row.day.date().isoformat(): int(row.conversation_count)
        for row in rows
    }
    items: list[AdminUsageDailyItem] = []
    cursor = from_date.date()
    while cursor <= to_date.date():
        key = cursor.isoformat()
        items.append(AdminUsageDailyItem(date=key, conversation_count=row_map.get(key, 0)))
        cursor += timedelta(days=1)
    return AdminUsageDailyResponse(
        range_type=normalized_range,
        from_date=from_date.date().isoformat(),
        to_date=to_date.date().isoformat(),
        items=items,
    )


def get_usage_chatbots_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    range_type: str | None,
    from_raw: str | None,
    to_raw: str | None,
) -> AdminChatbotUsageResponse:
    organization_id = require_institution_organization_id(principal)
    _, from_date, to_date = _range_for_type(range_type, from_raw, to_raw)

    chatbots = list_org_chatbots(db, organization_id=organization_id)
    conversation_rows = get_chatbot_conversation_counts(
        db,
        organization_id=organization_id,
        from_date=from_date,
        to_date=to_date,
    )
    message_rows = get_chatbot_message_stats(
        db,
        organization_id=organization_id,
        from_date=from_date,
        to_date=to_date,
    )

    conversation_map = {
        str(row.chatbot_id): int(row.conversation_count)
        for row in conversation_rows
    }
    message_map = {
        str(row.chatbot_id): row
        for row in message_rows
    }

    items: list[AdminChatbotUsageItem] = []
    for chatbot in chatbots:
        chatbot_id = str(chatbot.id)
        stats = message_map.get(chatbot_id)
        assistant_count = int(stats.assistant_count) if stats and stats.assistant_count is not None else 0
        success_count = int(stats.success_count) if stats and stats.success_count is not None else 0
        fallback_count = int(stats.fallback_count) if stats and stats.fallback_count is not None else 0
        items.append(
            AdminChatbotUsageItem(
                chatbot_id=chatbot_id,
                chatbot_name=chatbot.name,
                conversation_count=conversation_map.get(chatbot_id, 0),
                average_response_time_ms=(
                    round(float(stats.average_response_time_ms), 1)
                    if stats and stats.average_response_time_ms is not None
                    else None
                ),
                success_rate=_to_percent(success_count, assistant_count),
                fallback_rate=_to_percent(fallback_count, assistant_count),
            )
        )
    items.sort(key=lambda item: (-item.conversation_count, item.chatbot_name))
    return AdminChatbotUsageResponse(items=items)

