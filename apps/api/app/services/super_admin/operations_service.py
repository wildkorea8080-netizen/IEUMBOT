import copy
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import (
    AuditLog,
    ChatbotSetting,
    GuardrailRule,
    Organization,
    RetrievalControlRule,
    SynonymDictionary,
    WidgetDeployment,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.super_admin_operations import (
    SuperAdminBlueprintApplyRequest,
    SuperAdminBlueprintApplyResponse,
    SuperAdminBlueprintCreateRequest,
    SuperAdminBlueprintItem,
    SuperAdminBlueprintListResponse,
    SuperAdminBlueprintResponse,
)
from app.services.widget_install_script import build_widget_install_script

BLUEPRINT_CREATED_ACTION = "BLUEPRINT_CREATED"
BLUEPRINT_APPLIED_ACTION = "BLUEPRINT_APPLIED"


def _validate_uuid_or_404(value: str, detail: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _deepcopy_json(value: Any, fallback: Any) -> Any:
    if value is None:
        return copy.deepcopy(fallback)
    return copy.deepcopy(value)


def _get_organization(db: Session, organization_id: str) -> Organization:
    row = db.execute(select(Organization).where(Organization.id == organization_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")
    return row


def _select_source_chatbot(db: Session, organization_id: str) -> ChatbotSetting:
    stmt = (
        select(ChatbotSetting)
        .where(ChatbotSetting.organization_id == organization_id, ChatbotSetting.deleted_at.is_(None))
        .order_by((ChatbotSetting.status == "active").desc(), ChatbotSetting.created_at.desc())
        .limit(1)
    )
    row = db.execute(stmt).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOURCE_CHATBOT_NOT_FOUND")
    return row


def _get_existing_target_chatbot(db: Session, organization_id: str) -> ChatbotSetting | None:
    stmt = (
        select(ChatbotSetting)
        .where(ChatbotSetting.organization_id == organization_id, ChatbotSetting.deleted_at.is_(None))
        .order_by((ChatbotSetting.status == "active").desc(), ChatbotSetting.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def _unique_chatbot_name(db: Session, organization_id: str, base_name: str) -> str:
    name = base_name.strip() or "Blueprint Chatbot"
    exists_stmt = select(func.count(ChatbotSetting.id)).where(
        ChatbotSetting.organization_id == organization_id,
        ChatbotSetting.name == name,
        ChatbotSetting.deleted_at.is_(None),
    )
    if int(db.execute(exists_stmt).scalar_one()) == 0:
        return name
    for index in range(2, 100):
        candidate = f"{name} Blueprint {index}"
        count_stmt = select(func.count(ChatbotSetting.id)).where(
            ChatbotSetting.organization_id == organization_id,
            ChatbotSetting.name == candidate,
            ChatbotSetting.deleted_at.is_(None),
        )
        if int(db.execute(count_stmt).scalar_one()) == 0:
            return candidate
    return f"{name} Blueprint {uuid.uuid4().hex[:8]}"


def _chatbot_snapshot(row: ChatbotSetting) -> dict[str, Any]:
    return {
        "name": row.name,
        "status": row.status,
        "welcomeMessage": row.welcome_message,
        "descriptionText": row.description_text,
        "fallbackMessage": row.fallback_message,
        "persona": row.persona,
        "tone": row.tone,
        "answerLength": row.answer_length,
        "theme": _deepcopy_json(row.theme, {}),
        "businessHours": _deepcopy_json(row.business_hours, {}),
        "privacyNotice": row.privacy_notice,
        "citationMode": row.citation_mode,
        "webSearchEnabled": row.web_search_enabled,
        "allowedDomains": _deepcopy_json(row.allowed_domains, []),
        "answerPriorityPolicy": _deepcopy_json(row.answer_priority_policy, []),
        "corpusDomainPolicy": _deepcopy_json(row.corpus_domain_policy, {}),
        "searchControlPolicy": _deepcopy_json(row.search_control_policy, {}),
        "answerValidationPolicy": _deepcopy_json(row.answer_validation_policy, {}),
        "guardrailPolicy": _deepcopy_json(row.guardrail_policy, {}),
        "escalationPolicy": _deepcopy_json(row.escalation_policy, {}),
        "answerSettingsJson": _deepcopy_json(row.answer_settings_json, {}),
        "settingsVersion": row.settings_version,
    }


def _widget_snapshot(row: WidgetDeployment) -> dict[str, Any]:
    return {
        "allowedDomains": _deepcopy_json(row.allowed_domains, []),
        "themeColor": row.theme_color,
        "position": row.position,
        "launcherLabel": row.launcher_label,
        "welcomeMessage": row.welcome_message,
        "status": row.status,
    }


def _guardrail_snapshot(row: GuardrailRule) -> dict[str, Any]:
    return {
        "ruleType": row.rule_type,
        "targetCategory": row.target_category,
        "matchMode": row.match_mode,
        "matchValue": row.match_value,
        "actionType": row.action_type,
        "severity": row.severity,
        "fallbackMessage": row.fallback_message,
        "escalationMessage": row.escalation_message,
        "priority": row.priority,
        "isActive": row.is_active,
        "metadataJson": _deepcopy_json(row.metadata_json, {}),
    }


def _retrieval_rule_snapshot(row: RetrievalControlRule) -> dict[str, Any]:
    return {
        "ruleType": row.rule_type,
        "targetType": row.target_type,
        "corpusDomain": row.corpus_domain,
        "sourceType": row.source_type,
        "queryPattern": row.query_pattern,
        "boostValue": row.boost_value,
        "reason": row.reason,
        "isActive": row.is_active,
        "metadataJson": _deepcopy_json(row.metadata_json, {}),
    }


def _synonym_snapshot(row: SynonymDictionary) -> dict[str, Any]:
    return {
        "canonicalTerm": row.canonical_term,
        "synonymTerm": row.synonym_term,
        "isBidirectional": row.is_bidirectional,
        "scope": row.scope,
        "notes": row.notes,
        "isActive": row.is_active,
    }


def _build_blueprint_snapshot(db: Session, *, organization: Organization, chatbot: ChatbotSetting) -> dict[str, Any]:
    widgets = db.execute(
        select(WidgetDeployment)
        .where(WidgetDeployment.organization_id == organization.id, WidgetDeployment.chatbot_id == chatbot.id)
        .order_by(WidgetDeployment.created_at.desc())
    ).scalars()
    guardrails = db.execute(
        select(GuardrailRule)
        .where(GuardrailRule.organization_id == organization.id, GuardrailRule.chatbot_id == chatbot.id)
        .order_by(GuardrailRule.priority.asc(), GuardrailRule.created_at.asc())
    ).scalars()
    retrieval_rules = db.execute(
        select(RetrievalControlRule)
        .where(RetrievalControlRule.organization_id == organization.id, RetrievalControlRule.chatbot_id == chatbot.id)
        .order_by(RetrievalControlRule.created_at.asc())
    ).scalars()
    synonyms = db.execute(
        select(SynonymDictionary)
        .where(SynonymDictionary.organization_id == organization.id, SynonymDictionary.chatbot_id == chatbot.id)
        .order_by(SynonymDictionary.created_at.asc())
    ).scalars()

    return {
        "version": 1,
        "sourceOrganizationId": str(organization.id),
        "sourceOrganizationName": organization.name,
        "sourceChatbotId": str(chatbot.id),
        "sourceChatbotName": chatbot.name,
        "chatbot": _chatbot_snapshot(chatbot),
        "widgets": [_widget_snapshot(row) for row in widgets],
        "guardrailRules": [_guardrail_snapshot(row) for row in guardrails],
        "retrievalControlRules": [_retrieval_rule_snapshot(row) for row in retrieval_rules],
        "synonyms": [_synonym_snapshot(row) for row in synonyms],
        "excluded": ["documents", "documentVersions", "documentChunks", "webSources", "embeddings"],
    }


def _blueprint_logs(db: Session) -> list[AuditLog]:
    stmt = (
        select(AuditLog)
        .where(AuditLog.action == BLUEPRINT_CREATED_ACTION, AuditLog.target_type == "blueprint")
        .order_by(AuditLog.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def _usage_summary(db: Session) -> dict[str, tuple[int, str | None]]:
    stmt = select(AuditLog).where(AuditLog.action == BLUEPRINT_APPLIED_ACTION, AuditLog.target_type == "blueprint")
    usage: dict[str, tuple[int, str | None]] = {}
    for row in db.execute(stmt).scalars().all():
        blueprint_id = str((row.metadata_json or {}).get("blueprintId") or row.target_id or "")
        if not blueprint_id:
            continue
        current_count, current_last = usage.get(blueprint_id, (0, None))
        last_used_at = row.created_at.isoformat()
        if current_last and current_last > last_used_at:
            last_used_at = current_last
        usage[blueprint_id] = (current_count + 1, last_used_at)
    return usage


def _get_blueprint_log(db: Session, blueprint_id: str) -> AuditLog:
    blueprint_id = _validate_uuid_or_404(blueprint_id, "BLUEPRINT_NOT_FOUND")
    stmt = select(AuditLog).where(
        AuditLog.action == BLUEPRINT_CREATED_ACTION,
        AuditLog.target_type == "blueprint",
        AuditLog.target_id == blueprint_id,
    )
    row = db.execute(stmt).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BLUEPRINT_NOT_FOUND")
    return row


def list_blueprints_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> SuperAdminBlueprintListResponse:
    _ = principal
    usage = _usage_summary(db)
    items: list[SuperAdminBlueprintItem] = []
    for row in _blueprint_logs(db):
        metadata = row.metadata_json or {}
        snapshot = metadata.get("snapshot") if isinstance(metadata.get("snapshot"), dict) else {}
        blueprint_id = str(metadata.get("blueprintId") or row.target_id)
        usage_count, last_used_at = usage.get(blueprint_id, (0, None))
        items.append(
            SuperAdminBlueprintItem(
                blueprint_id=blueprint_id,
                organization_name=str(snapshot.get("sourceOrganizationName") or metadata.get("organizationName") or "-"),
                chatbot_name=str(snapshot.get("sourceChatbotName") or metadata.get("chatbotName") or "-"),
                created_at=row.created_at.isoformat(),
                last_used_at=last_used_at,
                usage_count=usage_count,
            )
        )
    return SuperAdminBlueprintListResponse(items=items, total=len(items))


def create_blueprint_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: SuperAdminBlueprintCreateRequest,
) -> SuperAdminBlueprintResponse:
    source_organization_id = _validate_uuid_or_404(body.source_organization_id, "ORGANIZATION_NOT_FOUND")
    organization = _get_organization(db, source_organization_id)
    chatbot = _select_source_chatbot(db, source_organization_id)
    blueprint_id = str(uuid.uuid4())
    snapshot = _build_blueprint_snapshot(db, organization=organization, chatbot=chatbot)

    create_audit_log(
        db,
        organization_id=source_organization_id,
        admin_id=principal.admin_id,
        action=BLUEPRINT_CREATED_ACTION,
        target_type="blueprint",
        target_id=blueprint_id,
        result="success",
        request_id=None,
        metadata_json={
            "blueprintId": blueprint_id,
            "sourceOrganizationId": source_organization_id,
            "sourceChatbotId": str(chatbot.id),
            "organizationName": organization.name,
            "chatbotName": chatbot.name,
            "snapshot": snapshot,
        },
    )
    db.commit()

    created_at = _utcnow().isoformat()
    created_row = _get_blueprint_log(db, blueprint_id)
    created_at = created_row.created_at.isoformat()
    return SuperAdminBlueprintResponse(
        blueprint_id=blueprint_id,
        organization_name=organization.name,
        chatbot_name=chatbot.name,
        created_at=created_at,
        last_used_at=None,
        usage_count=0,
        source_organization_id=source_organization_id,
        source_chatbot_id=str(chatbot.id),
    )


def _apply_chatbot_snapshot(
    db: Session,
    *,
    target_organization_id: str,
    snapshot: dict[str, Any],
    overwrite_existing: bool,
) -> tuple[ChatbotSetting, bool]:
    chatbot_data = snapshot.get("chatbot") if isinstance(snapshot.get("chatbot"), dict) else {}
    existing = _get_existing_target_chatbot(db, target_organization_id) if overwrite_existing else None
    if existing is None:
        row = ChatbotSetting(
            organization_id=target_organization_id,
            name=_unique_chatbot_name(db, target_organization_id, str(chatbot_data.get("name") or "Blueprint Chatbot")),
            status=str(chatbot_data.get("status") or "active"),
        )
        db.add(row)
        db.flush()
        overwritten = False
    else:
        row = existing
        overwritten = True

    row.welcome_message = chatbot_data.get("welcomeMessage")
    row.description_text = chatbot_data.get("descriptionText")
    row.fallback_message = chatbot_data.get("fallbackMessage")
    row.persona = chatbot_data.get("persona")
    row.tone = str(chatbot_data.get("tone") or "polite")
    row.answer_length = str(chatbot_data.get("answerLength") or "medium")
    row.theme = _deepcopy_json(chatbot_data.get("theme"), {})
    row.business_hours = _deepcopy_json(chatbot_data.get("businessHours"), {})
    row.privacy_notice = chatbot_data.get("privacyNotice")
    row.citation_mode = str(chatbot_data.get("citationMode") or "visible")
    row.web_search_enabled = bool(chatbot_data.get("webSearchEnabled") or False)
    row.allowed_domains = _deepcopy_json(chatbot_data.get("allowedDomains"), [])
    row.answer_priority_policy = _deepcopy_json(chatbot_data.get("answerPriorityPolicy"), [])
    row.corpus_domain_policy = _deepcopy_json(chatbot_data.get("corpusDomainPolicy"), {})
    row.search_control_policy = _deepcopy_json(chatbot_data.get("searchControlPolicy"), {})
    row.answer_validation_policy = _deepcopy_json(chatbot_data.get("answerValidationPolicy"), {})
    row.guardrail_policy = _deepcopy_json(chatbot_data.get("guardrailPolicy"), {})
    row.escalation_policy = _deepcopy_json(chatbot_data.get("escalationPolicy"), {})
    row.answer_settings_json = _deepcopy_json(chatbot_data.get("answerSettingsJson"), {})
    row.settings_version = int(chatbot_data.get("settingsVersion") or row.settings_version or 1)
    if overwrite_existing:
        row.status = str(chatbot_data.get("status") or row.status or "active")
    return row, overwritten


def _replace_related_rows(db: Session, *, organization_id: str, chatbot_id: str) -> None:
    db.execute(delete(GuardrailRule).where(GuardrailRule.organization_id == organization_id, GuardrailRule.chatbot_id == chatbot_id))
    db.execute(
        delete(RetrievalControlRule).where(
            RetrievalControlRule.organization_id == organization_id,
            RetrievalControlRule.chatbot_id == chatbot_id,
        )
    )
    db.execute(
        delete(SynonymDictionary).where(
            SynonymDictionary.organization_id == organization_id,
            SynonymDictionary.chatbot_id == chatbot_id,
        )
    )
    db.execute(
        delete(WidgetDeployment).where(
            WidgetDeployment.organization_id == organization_id,
            WidgetDeployment.chatbot_id == chatbot_id,
        )
    )


def _create_related_rows(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
    chatbot_id: str,
    snapshot: dict[str, Any],
) -> str | None:
    first_widget_id: str | None = None
    for item in snapshot.get("widgets") if isinstance(snapshot.get("widgets"), list) else []:
        if not isinstance(item, dict):
            continue
        widget = WidgetDeployment(
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            allowed_domains=_deepcopy_json(item.get("allowedDomains"), []),
            theme_color=item.get("themeColor"),
            position=str(item.get("position") or "bottom-right"),
            launcher_label=item.get("launcherLabel"),
            welcome_message=item.get("welcomeMessage"),
            status=str(item.get("status") or "active"),
            install_script=build_widget_install_script(chatbot_id=chatbot_id),
        )
        db.add(widget)
        db.flush()
        if first_widget_id is None:
            first_widget_id = str(widget.id)

    for item in snapshot.get("guardrailRules") if isinstance(snapshot.get("guardrailRules"), list) else []:
        if not isinstance(item, dict):
            continue
        db.add(
            GuardrailRule(
                organization_id=organization_id,
                chatbot_id=chatbot_id,
                created_by_admin_id=principal.admin_id,
                rule_type=str(item.get("ruleType") or "keyword"),
                target_category=item.get("targetCategory"),
                match_mode=str(item.get("matchMode") or "keyword_any"),
                match_value=item.get("matchValue"),
                action_type=str(item.get("actionType") or "fallback"),
                severity=str(item.get("severity") or "medium"),
                fallback_message=item.get("fallbackMessage"),
                escalation_message=item.get("escalationMessage"),
                priority=int(item.get("priority") or 100),
                is_active=bool(item.get("isActive", True)),
                metadata_json=_deepcopy_json(item.get("metadataJson"), {}),
            )
        )

    for item in snapshot.get("retrievalControlRules") if isinstance(snapshot.get("retrievalControlRules"), list) else []:
        if not isinstance(item, dict):
            continue
        db.add(
            RetrievalControlRule(
                organization_id=organization_id,
                chatbot_id=chatbot_id,
                created_by_admin_id=principal.admin_id,
                rule_type=str(item.get("ruleType") or "boost"),
                target_type=str(item.get("targetType") or "query"),
                corpus_domain=item.get("corpusDomain"),
                source_type=item.get("sourceType"),
                query_pattern=item.get("queryPattern"),
                boost_value=item.get("boostValue"),
                reason=item.get("reason"),
                is_active=bool(item.get("isActive", True)),
                metadata_json=_deepcopy_json(item.get("metadataJson"), {}),
            )
        )

    for item in snapshot.get("synonyms") if isinstance(snapshot.get("synonyms"), list) else []:
        if not isinstance(item, dict):
            continue
        db.add(
            SynonymDictionary(
                organization_id=organization_id,
                chatbot_id=chatbot_id,
                canonical_term=str(item.get("canonicalTerm") or ""),
                synonym_term=str(item.get("synonymTerm") or ""),
                is_bidirectional=bool(item.get("isBidirectional", True)),
                scope=str(item.get("scope") or "global"),
                notes=item.get("notes"),
                is_active=bool(item.get("isActive", True)),
            )
        )
    db.flush()
    return first_widget_id


def apply_blueprint_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    blueprint_id: str,
    body: SuperAdminBlueprintApplyRequest,
) -> SuperAdminBlueprintApplyResponse:
    target_organization_id = _validate_uuid_or_404(body.target_organization_id, "ORGANIZATION_NOT_FOUND")
    _get_organization(db, target_organization_id)
    blueprint_log = _get_blueprint_log(db, blueprint_id)
    metadata = blueprint_log.metadata_json or {}
    snapshot = metadata.get("snapshot")
    if not isinstance(snapshot, dict):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="BLUEPRINT_SNAPSHOT_MISSING")

    chatbot, overwritten = _apply_chatbot_snapshot(
        db,
        target_organization_id=target_organization_id,
        snapshot=snapshot,
        overwrite_existing=body.overwrite_existing,
    )
    if overwritten:
        _replace_related_rows(db, organization_id=target_organization_id, chatbot_id=str(chatbot.id))
    widget_id = _create_related_rows(
        db,
        principal=principal,
        organization_id=target_organization_id,
        chatbot_id=str(chatbot.id),
        snapshot=snapshot,
    )

    applied_at = _utcnow()
    create_audit_log(
        db,
        organization_id=target_organization_id,
        admin_id=principal.admin_id,
        action=BLUEPRINT_APPLIED_ACTION,
        target_type="blueprint",
        target_id=str(chatbot.id),
        result="success",
        request_id=None,
        metadata_json={
            "blueprintId": blueprint_id,
            "targetOrganizationId": target_organization_id,
            "chatbotId": str(chatbot.id),
            "widgetId": widget_id,
            "overwriteExisting": body.overwrite_existing,
            "overwritten": overwritten,
            "excluded": snapshot.get("excluded", []),
        },
    )
    db.commit()
    return SuperAdminBlueprintApplyResponse(
        blueprint_id=blueprint_id,
        target_organization_id=target_organization_id,
        chatbot_id=str(chatbot.id),
        widget_id=widget_id,
        overwritten=overwritten,
        applied_at=applied_at.isoformat(),
    )
