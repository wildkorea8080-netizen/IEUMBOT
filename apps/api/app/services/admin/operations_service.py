import uuid
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
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
        welcome_message=row.welcome_message,
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
        welcome_message=row.welcome_message,
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
    if body.welcome_message is not None:
        row.welcome_message = body.welcome_message
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
        welcome_message=row.welcome_message,
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

    install_script = build_widget_install_script(chatbot_id=str(widget.chatbot_id))
    chatbot = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    theme = chatbot.theme if isinstance(chatbot.theme, dict) else {}
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
    install_script = build_widget_install_script(chatbot_id=str(widget.chatbot_id))
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
