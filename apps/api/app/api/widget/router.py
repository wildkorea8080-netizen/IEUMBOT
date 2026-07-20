import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db_session
from app.models import ChatbotSetting, DocumentChunk, QuickAction, WidgetDeployment
from app.schemas.widget import (
    WidgetBanner,
    WidgetConsultationSnapshot,
    WidgetOperatingHours,
    WidgetPublicConfigResponse,
    WidgetQuickAction,
    WidgetTheme,
    WidgetTrustBadge,
)
from app.services.enforcement_service import ensure_runtime_access_for_widget

router = APIRouter(tags=["widget"])

_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _abs_url(url: str | None) -> str | None:
    """상대경로(/ 시작)를 widget_public_web_base_url 기준 절대 URL로 변환한다."""
    web_base = settings.api_widget_public_web_base_url.strip()
    if url and url.startswith("/") and web_base:
        return web_base.rstrip("/") + url
    return url


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


# 신뢰·보안 표기 뱃지 — 기본값(관리자가 커스터마이즈/비활성 가능).
_DEFAULT_TRUST_BADGES = [
    {"icon": "✓", "label": "공식 등록 자료 기반 답변"},
    {"icon": "🔒", "label": "개인정보 자동 보호"},
]


def _resolve_trust_badges(theme: dict) -> list[WidgetTrustBadge]:
    """테마에서 신뢰 뱃지 해석. 기본 ON(미설정 시 기본 뱃지), 명시적 off/커스텀/빈배열 지원."""
    enabled = theme.get("widgetTrustBadgesEnabled")
    if enabled is None:
        enabled = theme.get("widget_trust_badges_enabled")
    if enabled is False:
        return []
    raw = theme.get("widgetTrustBadges")
    if raw is None:
        raw = theme.get("widget_trust_badges")
    items = raw if isinstance(raw, list) else _DEFAULT_TRUST_BADGES
    badges: list[WidgetTrustBadge] = []
    for item in items[:4]:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        icon = str(item.get("icon") or "").strip()[:4] or "✓"
        badges.append(WidgetTrustBadge(icon=icon, label=label[:40]))
    return badges


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
    starter_question_style_raw = theme.get("widgetStarterQuestionStyle") or theme.get(
        "widget_starter_question_style"
    )
    starter_question_style = (
        starter_question_style_raw
        if starter_question_style_raw in ("banner", "list")
        else None
    )
    citation_presentation = theme.get("aiCitationPresentation") or theme.get("ai_citation_presentation")

    after_hours = _is_after_hours(chatbot.business_hours or {}, organization.timezone)
    operating_message = _build_after_hours_message(chatbot) if after_hours else None
    resolved_intro_message = intro_message if isinstance(intro_message, str) and intro_message.strip() else None
    resolved_welcome_message = (
        (widget.welcome_message if widget and widget.welcome_message else chatbot.welcome_message)
        or "안녕하세요. 궁금하신 내용을 입력해주시면 빠르게 안내해드리겠습니다."
    )
    if not resolved_intro_message and isinstance(resolved_welcome_message, str) and resolved_welcome_message.strip():
        resolved_intro_message = resolved_welcome_message.strip()

    return WidgetPublicConfigResponse(
        chatbot_id=str(chatbot.id),
        chatbot_name=chatbot_display_name.strip()
        if isinstance(chatbot_display_name, str) and chatbot_display_name.strip()
        else chatbot.name,
        institution_name=institution_name if isinstance(institution_name, str) else None,
        logo_url=_abs_url(logo_url if isinstance(logo_url, str) else None),
        intro_message=resolved_intro_message,
        welcome_message=resolved_welcome_message,
        quick_reply_hints=[
            item.strip()[:40]
            for item in (chatbot.quick_reply_hints or [])
            if isinstance(item, str) and item.strip()
        ][:5],
        privacy_notice=chatbot.privacy_notice,
        citation_mode=chatbot.citation_mode,
        citation_presentation=citation_presentation if isinstance(citation_presentation, str) else None,
        theme=WidgetTheme(
            primary_color=primary_color if isinstance(primary_color, str) else None,
            text_color=text_color if isinstance(text_color, str) else None,
            background_color=background_color if isinstance(background_color, str) else None,
            preset=preset if isinstance(preset, str) else None,
            launcher_icon=launcher_icon if isinstance(launcher_icon, str) else None,
            launcher_icon_url=_abs_url(launcher_icon_url if isinstance(launcher_icon_url, str) else None),
        ),
        banner=WidgetBanner(
            title=banner_title if isinstance(banner_title, str) else None,
            description=banner_description if isinstance(banner_description, str) else None,
        ),
        trust_badges=_resolve_trust_badges(theme),
        starter_questions=[
            item.strip()
            for item in starter_questions
            if isinstance(item, str) and item.strip()
        ]
        if isinstance(starter_questions, list)
        else [],
        starter_question_style=starter_question_style,
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


def _parse_consultation_text(text: str) -> tuple[str, str]:
    """수집 저장된 상담 청크(`[질문] .. [답변] ..`)를 질문/답변으로 분리."""
    raw = text or ""
    if "[답변]" in raw:
        pre, answer = raw.split("[답변]", 1)
    else:
        pre, answer = raw, ""
    question = pre.replace("[질문]", "", 1)
    return question.strip(), answer.strip()


@router.get(
    "/consultation/{chatbot_id}/{chunk_id}",
    response_model=WidgetConsultationSnapshot,
)
def get_widget_consultation_snapshot(
    chatbot_id: str,
    chunk_id: str,
    db: Session = Depends(get_db_session),  # noqa: B008
) -> WidgetConsultationSnapshot:
    """상담게시판 근거의 내부 스냅샷 — 참조한 상담 원문(마스킹됨)을 표시.

    게시판이 JS(POST)라 개별글 URL이 없으므로, 수집 때 저장한 질문/답변을 보여준다.
    보안: 해당 챗봇 소유 + extraction_method=='seoul_labor' 청크만 노출(내부 청크 노출 금지).
    """
    chatbot = db.execute(
        select(ChatbotSetting).where(
            ChatbotSetting.id == chatbot_id,
            ChatbotSetting.deleted_at.is_(None),
        )
    ).scalar_one_or_none()
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    ensure_runtime_access_for_widget(db, chatbot_id=str(chatbot.id))

    try:
        chunk_uuid = uuid.UUID(chunk_id)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="SNAPSHOT_NOT_FOUND"
        ) from exc

    chunk = db.execute(
        select(DocumentChunk).where(
            DocumentChunk.id == chunk_uuid,
            DocumentChunk.chatbot_id == chatbot.id,
        )
    ).scalar_one_or_none()
    if chunk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SNAPSHOT_NOT_FOUND")

    meta = chunk.metadata_json if isinstance(chunk.metadata_json, dict) else {}
    if str(meta.get("extraction_method") or "").lower() != "seoul_labor":
        # 상담 스냅샷만 노출 — 일반 문서/웹 청크 본문은 위젯에 공개하지 않음.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SNAPSHOT_NOT_FOUND")

    question, answer = _parse_consultation_text(chunk.text_content or "")
    url = meta.get("url") or meta.get("final_url") or ""
    receipt_no = url.split("#", 1)[1] if "#" in url else None
    source_list_url = url.split("#", 1)[0] if url else None

    return WidgetConsultationSnapshot(
        available=True,
        title=chunk.section_title or meta.get("page_title"),
        category=meta.get("category"),
        question=question,
        answer=answer,
        board_label="서울노동권익센터 상담게시판",
        receipt_no=receipt_no,
        source_list_url=source_list_url,
    )
