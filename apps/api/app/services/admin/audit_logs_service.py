from datetime import UTC, datetime, time
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.repositories.admin.audit_logs_repository import get_audit_log_detail, list_audit_logs
from app.schemas.audit_logs import (
    AdminAuditLogDetailResponse,
    AdminAuditLogItem,
    AdminAuditLogsResponse,
)
from app.services.admin.scope_service import require_institution_organization_id

_SENSITIVE_KEYS = {"password", "token", "secret", "authorization", "cookie", "apiKey", "api_key"}


def _parse_datetime_range(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        date_value = datetime.fromisoformat(value).date()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_DATE_FORMAT") from exc
    return datetime.combine(date_value, time.max if end_of_day else time.min, tzinfo=UTC)


def _action_type_filters(action_type: str | None) -> list[str] | None:
    if not action_type:
        return None
    normalized = action_type.strip().lower()
    if normalized == "login":
        return ["%login%"]
    if normalized == "knowledge":
        return ["admin.knowledge.%", "admin.document.%", "admin.web_source.%"]
    if normalized == "settings":
        return ["admin.answer_settings.%", "admin.guardrails.%", "admin.escalation_rules.%", "admin.search_control.%"]
    if normalized == "chatbot":
        return ["admin.chatbot.%", "admin.chatbots.%"]
    if normalized == "widget":
        return ["admin.widget.%", "widget.%"]
    if normalized == "contract":
        return ["contract.%", "super_admin.contract.%"]
    return [normalized]


def _action_type_label(action: str) -> tuple[str, str]:
    lowered = action.lower()
    if "login" in lowered:
        return "login", "로그인"
    if lowered.startswith(("admin.knowledge.", "admin.document.", "admin.web_source.")):
        return "knowledge", "지식 등록"
    if lowered.startswith(("admin.answer_settings.", "admin.guardrails.", "admin.escalation_rules.", "admin.search_control.")):
        return "settings", "설정 변경"
    if lowered.startswith(("admin.chatbot.", "admin.chatbots.")):
        return "chatbot", "챗봇 변경"
    if lowered.startswith(("admin.widget.", "widget.")):
        return "widget", "위젯 생성"
    if "contract" in lowered:
        return "contract", "계약 변경"
    return "other", action


def _safe_metadata_summary(metadata: object) -> dict[str, str]:
    if not isinstance(metadata, dict):
        return {}
    result: dict[str, str] = {}
    for key, value in metadata.items():
        key_text = str(key)
        lowered = key_text.lower()
        if any(token.lower() in lowered for token in _SENSITIVE_KEYS):
            continue
        if isinstance(value, (str, int, float, bool)):
            result[key_text] = str(value)
        elif value is None:
            result[key_text] = "-"
        elif isinstance(value, list):
            result[key_text] = f"list[{len(value)}]"
        elif isinstance(value, dict):
            result[key_text] = f"object[{len(value)}]"
        else:
            result[key_text] = value.__class__.__name__
        if len(result) >= 8:
            break
    return result


def list_audit_logs_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    from_date_raw: str | None,
    to_date_raw: str | None,
    admin_email: str | None,
    action_type: str | None,
    page: int,
    page_size: int,
) -> AdminAuditLogsResponse:
    organization_id = require_institution_organization_id(principal)
    rows, total_count = list_audit_logs(
        db,
        organization_id=organization_id,
        from_date=_parse_datetime_range(from_date_raw),
        to_date=_parse_datetime_range(to_date_raw, end_of_day=True),
        admin_email=(admin_email.strip() if admin_email else None),
        action_filters=_action_type_filters(action_type),
        offset=(page - 1) * page_size,
        limit=page_size,
    )

    items: list[AdminAuditLogItem] = []
    for audit_log, admin in rows:
        action_type_key, action_label = _action_type_label(audit_log.action)
        items.append(
            AdminAuditLogItem(
                log_id=str(audit_log.id),
                time=audit_log.created_at.isoformat(),
                admin_email=(admin.email if admin else None),
                admin_name=(admin.name if admin else None),
                action=audit_log.action,
                action_label=action_label,
                action_type=action_type_key,
                target_type=audit_log.target_type,
                target_id=audit_log.target_id,
                result=audit_log.result,
            )
        )

    return AdminAuditLogsResponse(items=items, total_count=total_count, page=page, page_size=page_size)


def get_audit_log_detail_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    log_id: str,
) -> AdminAuditLogDetailResponse:
    organization_id = require_institution_organization_id(principal)
    try:
        UUID(log_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AUDIT_LOG_NOT_FOUND") from exc

    row = get_audit_log_detail(db, organization_id=organization_id, log_id=log_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AUDIT_LOG_NOT_FOUND")

    audit_log, admin = row
    action_type_key, action_label = _action_type_label(audit_log.action)
    return AdminAuditLogDetailResponse(
        log_id=str(audit_log.id),
        time=audit_log.created_at.isoformat(),
        admin_email=(admin.email if admin else None),
        admin_name=(admin.name if admin else None),
        action=audit_log.action,
        action_label=action_label,
        action_type=action_type_key,
        target_type=audit_log.target_type,
        target_id=audit_log.target_id,
        result=audit_log.result,
        metadata_summary=_safe_metadata_summary(audit_log.metadata_json),
    )

