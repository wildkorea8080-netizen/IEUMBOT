import json
import uuid
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import AuditLog, ChatbotSetting, LLMUsageLog, Notification, Organization, SystemIntegration
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.notifications import (
    NotificationItem,
    NotificationListResponse,
    SystemIntegrationItem,
    SystemIntegrationListResponse,
    SystemIntegrationUpsertRequest,
)

NOTIFICATION_TYPES = {"usage_warning", "usage_exceeded", "error", "system", "security"}
NOTIFICATION_SEVERITIES = {"info", "warning", "critical"}
NOTIFICATION_SENT_TO = {"slack", "email", "webhook", "inapp"}
INTEGRATION_TYPES = {"slack", "email", "webhook"}


def _validate_uuid(value: str | None) -> str | None:
    if value is None:
        return None
    return str(uuid.UUID(value))


def _resolve_audit_organization_id(db: Session, organization_id: str | None) -> str:
    if organization_id:
        return organization_id
    row = db.execute(select(Organization.id).order_by(Organization.created_at.asc()).limit(1)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ORGANIZATION_REQUIRED_FOR_AUDIT")
    return str(row)


def _create_notification_audit(
    db: Session,
    *,
    organization_id: str | None,
    admin_id: str | None,
    action: str,
    target_id: str | None,
    result: str,
    metadata_json: dict[str, Any],
) -> None:
    create_audit_log(
        db,
        organization_id=_resolve_audit_organization_id(db, organization_id),
        admin_id=admin_id,
        action=action,
        target_type="notification",
        target_id=target_id,
        result=result,
        request_id=None,
        metadata_json=metadata_json,
    )


def _organization_name(db: Session, organization_id: str | None) -> str | None:
    if not organization_id:
        return None
    return db.execute(select(Organization.name).where(Organization.id == organization_id)).scalar_one_or_none()


def _chatbot_name(db: Session, chatbot_id: str | None) -> str | None:
    if not chatbot_id:
        return None
    return db.execute(select(ChatbotSetting.name).where(ChatbotSetting.id == chatbot_id)).scalar_one_or_none()


def _to_item(row: Notification) -> NotificationItem:
    return NotificationItem(
        id=str(row.id),
        type=row.type,  # type: ignore[arg-type]
        severity=row.severity,  # type: ignore[arg-type]
        title=row.title,
        message=row.message,
        organization_id=(str(row.organization_id) if row.organization_id else None),
        chatbot_id=(str(row.chatbot_id) if row.chatbot_id else None),
        is_read=row.is_read,
        sent_to=row.sent_to,  # type: ignore[arg-type]
        metadata=dict(row.metadata_json or {}),
        created_at=row.created_at.isoformat(),
    )


def _to_integration_item(row: SystemIntegration) -> SystemIntegrationItem:
    config = dict(row.config_json or {})
    if row.type == "slack" and config.get("webhookUrl"):
        config["webhookUrl"] = "masked"
    return SystemIntegrationItem(
        id=str(row.id),
        type=row.type,  # type: ignore[arg-type]
        config=config,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def list_notifications_service(
    db: Session,
    *,
    organization_id: str | None,
    severity: str | None = None,
    type_value: str | None = None,
) -> NotificationListResponse:
    stmt = select(Notification).order_by(Notification.created_at.desc())
    if organization_id:
        stmt = stmt.where((Notification.organization_id == organization_id) | (Notification.organization_id.is_(None)))
    if severity:
        stmt = stmt.where(Notification.severity == severity)
    if type_value:
        stmt = stmt.where(Notification.type == type_value)
    rows = list(db.execute(stmt.limit(200)).scalars().all())
    return NotificationListResponse(items=[_to_item(row) for row in rows])


def mark_notification_read_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    notification_id: str,
    is_read: bool,
) -> NotificationItem:
    notification_id = _validate_uuid(notification_id)
    row = db.execute(select(Notification).where(Notification.id == notification_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOTIFICATION_NOT_FOUND")
    if principal.role != "super_admin" and principal.organization_id not in {None, str(row.organization_id) if row.organization_id else None}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="NOTIFICATION_SCOPE_FORBIDDEN")
    row.is_read = is_read
    db.commit()
    db.refresh(row)
    return _to_item(row)


def list_integrations_service(db: Session, *, principal: AdminPrincipal) -> SystemIntegrationListResponse:
    _ = principal
    rows = list(db.execute(select(SystemIntegration).order_by(SystemIntegration.created_at.desc())).scalars().all())
    return SystemIntegrationListResponse(items=[_to_integration_item(row) for row in rows])


def upsert_integration_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    integration_id: str | None,
    body: SystemIntegrationUpsertRequest,
) -> SystemIntegrationItem:
    if body.type not in INTEGRATION_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_INTEGRATION_TYPE")
    if body.type == "slack" and not str(body.config.get("webhookUrl") or "").strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="SLACK_WEBHOOK_URL_REQUIRED")

    row: SystemIntegration | None = None
    if integration_id is not None:
        integration_id = _validate_uuid(integration_id)
        row = db.execute(select(SystemIntegration).where(SystemIntegration.id == integration_id)).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="INTEGRATION_NOT_FOUND")
    else:
        row = db.execute(select(SystemIntegration).where(SystemIntegration.type == body.type)).scalar_one_or_none()

    if row is None:
        row = SystemIntegration(type=body.type, config_json=body.config, is_active=body.is_active)
        db.add(row)
        db.flush()
    else:
        next_config = dict(body.config)
        if body.type == "slack" and str(next_config.get("webhookUrl") or "").strip() in {"masked", "Configured"}:
            current_config = dict(row.config_json or {})
            next_config["webhookUrl"] = current_config.get("webhookUrl")
        row.type = body.type
        row.config_json = next_config
        row.is_active = body.is_active

    _create_notification_audit(
        db,
        organization_id=None,
        admin_id=principal.admin_id,
        action="notification.integration.update",
        target_id=str(row.id),
        result="success",
        metadata_json={"type": row.type, "isActive": row.is_active},
    )
    db.commit()
    db.refresh(row)
    return _to_integration_item(row)


def _active_slack_integrations(db: Session) -> list[SystemIntegration]:
    stmt = select(SystemIntegration).where(SystemIntegration.type == "slack", SystemIntegration.is_active.is_(True))
    return list(db.execute(stmt).scalars().all())


def send_slack(
    db: Session,
    *,
    notification: Notification,
) -> None:
    org_name = _organization_name(db, str(notification.organization_id) if notification.organization_id else None)
    chatbot_name = _chatbot_name(db, str(notification.chatbot_id) if notification.chatbot_id else None)
    for integration in _active_slack_integrations(db):
        config = dict(integration.config_json or {})
        webhook_url = str(config.get("webhookUrl") or "").strip()
        if not webhook_url:
            continue
        mention = str(config.get("mention") or "").strip()
        lines = [
            "[IEUMBOT ALERT]",
            f"Organization: {org_name or '-'}",
            f"Type: {notification.type}",
            f"Severity: {notification.severity}",
            f"Title: {notification.title}",
            f"Message: {notification.message}",
        ]
        if chatbot_name:
            lines.append(f"Chatbot: {chatbot_name}")
        if mention:
            lines.append(f"Mention: {mention}")
        payload = {"text": "\n".join(lines)}
        request = urllib.request.Request(
            url=webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10):
                pass
            _create_notification_audit(
                db,
                organization_id=(str(notification.organization_id) if notification.organization_id else None),
                admin_id=None,
                action="notification.sent",
                target_id=str(notification.id),
                result="success",
                metadata_json={"channel": "slack", "integrationId": str(integration.id)},
            )
        except Exception as exc:
            _create_notification_audit(
                db,
                organization_id=(str(notification.organization_id) if notification.organization_id else None),
                admin_id=None,
                action="notification.failed",
                target_id=str(notification.id),
                result="failed",
                metadata_json={"channel": "slack", "integrationId": str(integration.id), "error": str(exc)},
            )


def send_email(*, notification: Notification) -> None:
    _ = notification


def send_webhook(*, notification: Notification) -> None:
    _ = notification


def _has_recent_duplicate(
    db: Session,
    *,
    type_value: str,
    organization_id: str | None,
    chatbot_id: str | None,
    title: str,
    within_minutes: int = 30,
) -> bool:
    since = datetime.now(UTC) - timedelta(minutes=within_minutes)
    stmt = select(func.count(Notification.id)).where(
        Notification.type == type_value,
        Notification.title == title,
        Notification.created_at >= since,
    )
    if organization_id:
        stmt = stmt.where(Notification.organization_id == organization_id)
    if chatbot_id:
        stmt = stmt.where(Notification.chatbot_id == chatbot_id)
    return int(db.execute(stmt).scalar_one() or 0) > 0


def create_notification(
    db: Session,
    *,
    type_value: str,
    severity: str,
    title: str,
    message: str,
    organization_id: str | None = None,
    chatbot_id: str | None = None,
    sent_to: str = "inapp",
    metadata: dict[str, Any] | None = None,
    dedupe_within_minutes: int | None = None,
) -> Notification:
    if type_value not in NOTIFICATION_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_NOTIFICATION_TYPE")
    if severity not in NOTIFICATION_SEVERITIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_NOTIFICATION_SEVERITY")
    if sent_to not in NOTIFICATION_SENT_TO:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_NOTIFICATION_CHANNEL")
    organization_id = _validate_uuid(organization_id)
    chatbot_id = _validate_uuid(chatbot_id)
    if dedupe_within_minutes and _has_recent_duplicate(
        db,
        type_value=type_value,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        title=title,
        within_minutes=dedupe_within_minutes,
    ):
        stmt = select(Notification).where(Notification.title == title).order_by(Notification.created_at.desc()).limit(1)
        return db.execute(stmt).scalar_one()

    row = Notification(
        type=type_value,
        severity=severity,
        title=title.strip(),
        message=message.strip(),
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        is_read=False,
        sent_to=sent_to,
        metadata_json=metadata or {},
    )
    db.add(row)
    db.flush()
    _create_notification_audit(
        db,
        organization_id=organization_id,
        admin_id=None,
        action="notification.created",
        target_id=str(row.id),
        result="success",
        metadata_json={"type": row.type, "severity": row.severity, "sentTo": row.sent_to},
    )
    send_slack(db, notification=row)
    return row


def safe_create_notification(db: Session, **kwargs: Any) -> Notification | None:
    try:
        return create_notification(db, **kwargs)
    except Exception:
        return None


def notify_billing_threshold(
    db: Session,
    *,
    organization_id: str,
    contract_id: str,
    level: str,
    metric_key: str,
    current_value: float,
    limit_value: float | None,
) -> None:
    type_value = "usage_warning" if level in {"warning", "alert"} else "usage_exceeded"
    severity = "critical" if level == "critical" else "warning"
    percent = 0.0
    if limit_value and limit_value > 0:
        percent = round((current_value / limit_value) * 100, 2)
    safe_create_notification(
        db,
        type_value=type_value,
        severity=severity,
        title=f"Billing threshold: {metric_key}",
        message=f"Current usage reached {percent}% for {metric_key}.",
        organization_id=organization_id,
        metadata={
            "contractId": contract_id,
            "metricKey": metric_key,
            "currentValue": current_value,
            "limitValue": limit_value,
            "percent": percent,
        },
        dedupe_within_minutes=60,
    )


def notify_maintenance_changed(
    db: Session,
    *,
    is_active: bool,
    mode: str,
    message: str,
) -> None:
    safe_create_notification(
        db,
        type_value="system",
        severity="info",
        title="Maintenance enabled" if is_active else "Maintenance disabled",
        message=message if is_active else f"Maintenance mode ended. Previous mode was {mode}.",
        metadata={"mode": mode, "isActive": is_active},
        dedupe_within_minutes=10,
    )


def notify_impersonation_started(
    db: Session,
    *,
    organization_id: str,
    super_admin_id: str,
    reason: str,
) -> None:
    safe_create_notification(
        db,
        type_value="security",
        severity="info",
        title="Support impersonation started",
        message=f"Super admin support access started. Reason: {reason}",
        organization_id=organization_id,
        metadata={"superAdminId": super_admin_id, "reason": reason},
        dedupe_within_minutes=5,
    )


def maybe_notify_api_error(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    provider: str,
    error_code: str,
) -> None:
    since = datetime.now(UTC) - timedelta(minutes=15)
    repeated_errors = int(
        db.execute(
            select(func.count(LLMUsageLog.id)).where(
                LLMUsageLog.organization_id == organization_id,
                LLMUsageLog.chatbot_id == chatbot_id,
                LLMUsageLog.success.is_(False),
                LLMUsageLog.error_code == error_code,
                LLMUsageLog.created_at >= since,
            )
        ).scalar_one()
        or 0
    )
    recent_total = int(
        db.execute(
            select(func.count(LLMUsageLog.id)).where(
                LLMUsageLog.organization_id == organization_id,
                LLMUsageLog.chatbot_id == chatbot_id,
                LLMUsageLog.created_at >= since,
            )
        ).scalar_one()
        or 0
    )
    recent_failed = int(
        db.execute(
            select(func.count(LLMUsageLog.id)).where(
                LLMUsageLog.organization_id == organization_id,
                LLMUsageLog.chatbot_id == chatbot_id,
                LLMUsageLog.success.is_(False),
                LLMUsageLog.created_at >= since,
            )
        ).scalar_one()
        or 0
    )
    failure_rate = (recent_failed / recent_total) * 100 if recent_total > 0 else 0.0
    if repeated_errors < 3 and not (recent_total >= 10 and failure_rate >= 30):
        return
    severity = "critical" if failure_rate >= 50 or repeated_errors >= 5 else "warning"
    safe_create_notification(
        db,
        type_value="error",
        severity=severity,
        title=f"LLM API errors detected: {error_code}",
        message=f"{provider} failures repeated for this chatbot. Recent failure rate is {failure_rate:.1f}%.",
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        metadata={
            "provider": provider,
            "errorCode": error_code,
            "repeatedErrors": repeated_errors,
            "failureRate": round(failure_rate, 2),
            "windowMinutes": 15,
        },
        dedupe_within_minutes=15,
    )
