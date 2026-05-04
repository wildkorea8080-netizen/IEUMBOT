from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.models import ChatbotSetting, QuickAction, WidgetDeployment
from app.schemas.widget import (
    WidgetBanner,
    WidgetOperatingHours,
    WidgetPublicConfigResponse,
    WidgetQuickAction,
    WidgetTheme,
)
from app.services.enforcement_service import ensure_runtime_access_for_widget

router = APIRouter(tags=["widget"])

_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _parse_hhmm_to_minutes(value: str | None) -> int | None:
    if not value or ":" not in value:
        return None
    hour_text, minute_text = value.split(":", 1)
    try:
        hour = int(hour_text)
        minute = int(minute_text)
    except ValueError:
        return None
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _is_after_hours(business_hours: dict, timezone_name: str) -> bool:
    if not isinstance(business_hours, dict) or not business_hours:
        return False
    if business_hours.get("alwaysOpen") is True:
        return False
    if business_hours.get("enabled") is False:
        return False

    schedule = business_hours.get("schedule")
    if not isinstance(schedule, dict):
        schedule = business_hours.get("weekly")
    if not isinstance(schedule, dict):
        return False

    now = datetime.now(ZoneInfo(timezone_name))
    day_key = _DAY_KEYS[now.weekday()]
    day_entry = schedule.get(day_key) or schedule.get(str(now.weekday())) or {}
    if not isinstance(day_entry, dict):
        return False
    if day_entry.get("enabled") is False:
        return True

    start = _parse_hhmm_to_minutes(day_entry.get("start") or day_entry.get("open"))
    end = _parse_hhmm_to_minutes(day_entry.get("end") or day_entry.get("close"))
    if start is None or end is None:
        return False

    current_minutes = now.hour * 60 + now.minute
    if start <= end:
        return not (start <= current_minutes <= end)
    return not (current_minutes >= start or current_minutes <= end)


def _build_after_hours_message(chatbot: ChatbotSetting) -> str | None:
    settings_json = chatbot.answer_settings_json if isinstance(chatbot.answer_settings_json, dict) else {}
    escalation_operating = settings_json.get("escalationOperating")
    if isinstance(escalation_operating, dict):
        message = escalation_operating.get("operatingHoursFallbackMessage")
        if isinstance(message, str) and message.strip():
            return message.strip()
    if chatbot.fallback_message:
        return chatbot.fallback_message
    return None


@router.get("/config/{chatbot_id}", response_model=WidgetPublicConfigResponse)
def get_widget_public_config(
    chatbot_id: str,
    db: Session = Depends(get_db_session),  # noqa: B008
) -> WidgetPublicConfigResponse:
    chatbot_stmt = select(ChatbotSetting).where(
        ChatbotSetting.id == chatbot_id,
        ChatbotSetting.deleted_at.is_(None),
    )
    chatbot = db.execute(chatbot_stmt).scalar_one_or_none()
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    organization, chatbot = ensure_runtime_access_for_widget(db, chatbot_id=str(chatbot.id))
    widget_stmt = select(WidgetDeployment).where(
        WidgetDeployment.chatbot_id == chatbot.id,
        WidgetDeployment.organization_id == chatbot.organization_id,
    )
    widget = db.execute(widget_stmt).scalar_one_or_none()

    quick_actions_stmt = (
        select(QuickAction)
        .where(
            QuickAction.organization_id == chatbot.organization_id,
            QuickAction.chatbot_id == chatbot.id,
            QuickAction.is_enabled.is_(True),
            QuickAction.is_deleted.is_(False),
        )
        .order_by(QuickAction.sort_order.asc(), QuickAction.created_at.asc())
        .limit(10)
    )
    quick_action_rows = list(db.execute(quick_actions_stmt).scalars().all())

    theme = chatbot.theme if isinstance(chatbot.theme, dict) else {}
    primary_color = theme.get("primaryColor") or theme.get("primary_color")
    text_color = theme.get("textColor") or theme.get("text_color")
    background_color = theme.get("backgroundColor") or theme.get("background_color")
    preset = theme.get("widgetColorPreset") or theme.get("widget_color_preset")
    launcher_icon = theme.get("widgetLauncherIcon") or theme.get("widget_launcher_icon")
    launcher_icon_url = theme.get("widgetLauncherIconUrl") or theme.get("widget_launcher_icon_url")
    launcher_hover_message = theme.get("widgetLauncherHoverMessage") or theme.get("widget_launcher_hover_message")
    chatbot_display_name = theme.get("widgetChatbotName") or theme.get("widget_chatbot_name")
    institution_name = theme.get("widgetInstitutionName") or theme.get("widget_institution_name")
    logo_url = theme.get("widgetLogoUrl") or theme.get("widget_logo_url")
    intro_message = theme.get("widgetIntroMessage") or theme.get("widget_intro_message")
    banner_title = theme.get("widgetBannerTitle") or theme.get("widget_banner_title")
    banner_description = theme.get("widgetBannerDescription") or theme.get("widget_banner_description")
    starter_questions = theme.get("widgetStarterQuestions") or theme.get("widget_starter_questions")

    after_hours = _is_after_hours(chatbot.business_hours or {}, organization.timezone)
    operating_message = _build_after_hours_message(chatbot) if after_hours else None
    resolved_intro_message = intro_message if isinstance(intro_message, str) and intro_message.strip() else None
    resolved_welcome_message = (
        (widget.welcome_message if widget and widget.welcome_message else chatbot.welcome_message)
        or f"{chatbot.name} ?곷떞 ?꾩슦誘몄엯?덈떎. 沅곴툑???댁슜???낅젰??二쇱꽭??"
    )
    if not resolved_intro_message and isinstance(resolved_welcome_message, str) and resolved_welcome_message.strip():
        resolved_intro_message = resolved_welcome_message.strip()

    return WidgetPublicConfigResponse(
        chatbot_id=str(chatbot.id),
        chatbot_name=chatbot_display_name.strip()
        if isinstance(chatbot_display_name, str) and chatbot_display_name.strip()
        else chatbot.name,
        institution_name=institution_name if isinstance(institution_name, str) else None,
        logo_url=logo_url if isinstance(logo_url, str) else None,
        intro_message=resolved_intro_message,
        welcome_message=resolved_welcome_message,
        privacy_notice=chatbot.privacy_notice,
        citation_mode=chatbot.citation_mode,
        theme=WidgetTheme(
            primary_color=primary_color if isinstance(primary_color, str) else None,
            text_color=text_color if isinstance(text_color, str) else None,
            background_color=background_color if isinstance(background_color, str) else None,
            preset=preset if isinstance(preset, str) else None,
            launcher_icon=launcher_icon if isinstance(launcher_icon, str) else None,
            launcher_icon_url=launcher_icon_url if isinstance(launcher_icon_url, str) else None,
        ),
        banner=WidgetBanner(
            title=banner_title if isinstance(banner_title, str) else None,
            description=banner_description if isinstance(banner_description, str) else None,
        ),
        starter_questions=[
            item.strip()
            for item in starter_questions
            if isinstance(item, str) and item.strip()
        ]
        if isinstance(starter_questions, list)
        else [],
        launcher_hover_message=launcher_hover_message if isinstance(launcher_hover_message, str) else None,
        quick_actions=[
            WidgetQuickAction(
                id=str(row.id),
                label=row.label,
                action_type=row.action_type,
                payload=row.payload,
                url=row.url,
                display_location=row.display_location,
                sort_order=row.sort_order,
            )
            for row in quick_action_rows
        ],
        operating_hours=WidgetOperatingHours(
            is_after_hours=after_hours,
            message=operating_message,
        ),
        runtime={
            "chatEndpoint": "/chat/messages",
            "chatStreamEndpoint": "/chat/messages/stream",
            "streamingMode": "sse_preferred",
            "sseEnabled": True,
        },
    )
