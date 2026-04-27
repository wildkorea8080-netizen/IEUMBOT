import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import (
    AuditLog,
    AutoEnforcementLog,
    AutoEnforcementPolicy,
    ChatbotSetting,
    Contract,
    LLMUsageLog,
    Organization,
    WidgetDeployment,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.enforcement import (
    AutoEnforcementLogItem,
    AutoEnforcementLogListResponse,
    AutoEnforcementPolicyItem,
    AutoEnforcementPolicyListResponse,
    AutoEnforcementPolicyUpdateRequest,
)
from app.services.notification_service import safe_create_notification

POLICY_TYPES = {"billing_over_limit", "contract_expired", "api_error_spike", "security_risk"}
ACTIONS = {"warn_only", "suspend_chat", "suspend_widget", "suspend_organization", "read_only"}
GENERIC_RUNTIME_BLOCK_MESSAGE = "현재 서비스 점검 또는 이용 제한 상태입니다."

DEFAULT_POLICIES = [
    {
        "policy_type": "billing_over_limit",
        "action": "read_only",
        "threshold_percent": 100.0,
        "error_window_minutes": None,
        "error_count_threshold": None,
        "is_active": True,
    },
    {
        "policy_type": "contract_expired",
        "action": "suspend_organization",
        "threshold_percent": None,
        "error_window_minutes": None,
        "error_count_threshold": None,
        "is_active": True,
    },
    {
        "policy_type": "api_error_spike",
        "action": "warn_only",
        "threshold_percent": None,
        "error_window_minutes": 15,
        "error_count_threshold": 5,
        "is_active": True,
    },
    {
        "policy_type": "security_risk",
        "action": "warn_only",
        "threshold_percent": None,
        "error_window_minutes": 15,
        "error_count_threshold": 3,
        "is_active": True,
    },
]


def _validate_uuid_or_404(value: str, detail: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _resolve_audit_organization_id(db: Session, organization_id: str | None) -> str:
    if organization_id:
        return organization_id
    row = db.execute(select(Organization.id).order_by(Organization.created_at.asc()).limit(1)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ORGANIZATION_REQUIRED_FOR_AUDIT")
    return str(row)


def _audit(
    db: Session,
    *,
    organization_id: str | None,
    admin_id: str | None,
    action: str,
    target_type: str,
    target_id: str | None,
    metadata_json: dict,
) -> None:
    create_audit_log(
        db,
        organization_id=_resolve_audit_organization_id(db, organization_id),
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        result="success",
        request_id=None,
        metadata_json=metadata_json,
    )


def _ensure_default_policies(db: Session) -> None:
    existing = {row.policy_type for row in db.execute(select(AutoEnforcementPolicy)).scalars().all()}
    created = False
    for item in DEFAULT_POLICIES:
        if item["policy_type"] in existing:
            continue
        db.add(AutoEnforcementPolicy(**item))
        created = True
    if created:
        db.flush()


def _policy_item(row: AutoEnforcementPolicy) -> AutoEnforcementPolicyItem:
    return AutoEnforcementPolicyItem(
        id=str(row.id),
        policy_type=row.policy_type,  # type: ignore[arg-type]
        action=row.action,  # type: ignore[arg-type]
        threshold_percent=row.threshold_percent,
        error_window_minutes=row.error_window_minutes,
        error_count_threshold=row.error_count_threshold,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _log_item(row: AutoEnforcementLog, policy_type: str) -> AutoEnforcementLogItem:
    return AutoEnforcementLogItem(
        id=str(row.id),
        organization_id=str(row.organization_id),
        chatbot_id=(str(row.chatbot_id) if row.chatbot_id else None),
        widget_id=(str(row.widget_id) if row.widget_id else None),
        policy_id=str(row.policy_id),
        policy_type=policy_type,  # type: ignore[arg-type]
        action=row.action,  # type: ignore[arg-type]
        reason=row.reason,
        previous_status=row.previous_status,
        new_status=row.new_status,
        resolved_at=row.resolved_at,
        resolved_by=(str(row.resolved_by) if row.resolved_by else None),
        metadata=dict(row.metadata_json or {}),
        created_at=row.created_at.isoformat(),
    )


def list_enforcement_policies_service(db: Session, *, principal: AdminPrincipal) -> AutoEnforcementPolicyListResponse:
    _ = principal
    _ensure_default_policies(db)
    rows = list(db.execute(select(AutoEnforcementPolicy).order_by(AutoEnforcementPolicy.policy_type.asc())).scalars().all())
    db.commit()
    return AutoEnforcementPolicyListResponse(items=[_policy_item(row) for row in rows])


def update_enforcement_policy_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    policy_id: str,
    body: AutoEnforcementPolicyUpdateRequest,
) -> AutoEnforcementPolicyItem:
    _ensure_default_policies(db)
    policy_id = _validate_uuid_or_404(policy_id, "ENFORCEMENT_POLICY_NOT_FOUND")
    row = db.execute(select(AutoEnforcementPolicy).where(AutoEnforcementPolicy.id == policy_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ENFORCEMENT_POLICY_NOT_FOUND")
    if body.action is not None:
        if body.action not in ACTIONS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ENFORCEMENT_ACTION")
        row.action = body.action
    if body.threshold_percent is not None:
        row.threshold_percent = body.threshold_percent
    if body.error_window_minutes is not None:
        row.error_window_minutes = body.error_window_minutes
    if body.error_count_threshold is not None:
        row.error_count_threshold = body.error_count_threshold
    if body.is_active is not None:
        row.is_active = body.is_active
    _audit(
        db,
        organization_id=None,
        admin_id=principal.admin_id,
        action="enforcement.policy.updated",
        target_type="auto_enforcement_policy",
        target_id=str(row.id),
        metadata_json={"policyType": row.policy_type, "action": row.action, "isActive": row.is_active},
    )
    db.commit()
    db.refresh(row)
    return _policy_item(row)


def list_enforcement_logs_service(db: Session, *, principal: AdminPrincipal) -> AutoEnforcementLogListResponse:
    _ = principal
    _ensure_default_policies(db)
    stmt = (
        select(AutoEnforcementLog, AutoEnforcementPolicy.policy_type)
        .join(AutoEnforcementPolicy, AutoEnforcementPolicy.id == AutoEnforcementLog.policy_id)
        .order_by(AutoEnforcementLog.created_at.desc())
        .limit(200)
    )
    rows = list(db.execute(stmt).all())
    return AutoEnforcementLogListResponse(items=[_log_item(log, policy_type) for log, policy_type in rows])


def _find_active_log(
    db: Session,
    *,
    policy_id: str,
    organization_id: str,
    chatbot_id: str | None = None,
    widget_id: str | None = None,
) -> AutoEnforcementLog | None:
    stmt = select(AutoEnforcementLog).where(
        AutoEnforcementLog.policy_id == policy_id,
        AutoEnforcementLog.organization_id == organization_id,
        AutoEnforcementLog.resolved_at.is_(None),
    )
    if chatbot_id:
        stmt = stmt.where(AutoEnforcementLog.chatbot_id == chatbot_id)
    if widget_id:
        stmt = stmt.where(AutoEnforcementLog.widget_id == widget_id)
    return db.execute(stmt.order_by(AutoEnforcementLog.created_at.desc()).limit(1)).scalar_one_or_none()


def _create_log(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None,
    widget_id: str | None,
    policy: AutoEnforcementPolicy,
    reason: str,
    previous_status: str | None,
    new_status: str | None,
    metadata_json: dict,
) -> AutoEnforcementLog:
    row = AutoEnforcementLog(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        widget_id=widget_id,
        policy_id=str(policy.id),
        action=policy.action,
        reason=reason,
        previous_status=previous_status,
        new_status=new_status,
        metadata_json=metadata_json,
    )
    db.add(row)
    db.flush()
    _audit(
        db,
        organization_id=organization_id,
        admin_id=None,
        action="enforcement.triggered",
        target_type="auto_enforcement_log",
        target_id=str(row.id),
        metadata_json={"policyType": policy.policy_type, "action": policy.action, "reason": reason},
    )
    safe_create_notification(
        db,
        type_value="system" if policy.policy_type == "contract_expired" else "usage_exceeded" if policy.policy_type == "billing_over_limit" else "error" if policy.policy_type == "api_error_spike" else "security",
        severity="critical" if policy.action != "warn_only" else "warning",
        title=f"Auto enforcement: {policy.policy_type}",
        message=reason,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        metadata={"policyId": str(policy.id), "action": policy.action, **metadata_json},
        dedupe_within_minutes=30,
    )
    return row


def _apply_policy_action(
    db: Session,
    *,
    policy: AutoEnforcementPolicy,
    organization: Organization,
    chatbot: ChatbotSetting | None,
    widget: WidgetDeployment | None,
    reason: str,
    metadata_json: dict,
) -> AutoEnforcementLog | None:
    existing = _find_active_log(
        db,
        policy_id=str(policy.id),
        organization_id=str(organization.id),
        chatbot_id=(str(chatbot.id) if chatbot else None),
        widget_id=(str(widget.id) if widget else None),
    )
    if existing is not None:
        return existing

    previous_status: str | None = None
    new_status: str | None = None
    if policy.action == "warn_only":
        row = _create_log(
            db,
            organization_id=str(organization.id),
            chatbot_id=(str(chatbot.id) if chatbot else None),
            widget_id=(str(widget.id) if widget else None),
            policy=policy,
            reason=reason,
            previous_status=None,
            new_status=None,
            metadata_json=metadata_json,
        )
        row.resolved_at = datetime.now(UTC).isoformat()
        return row
    elif policy.action == "suspend_chat":
        if chatbot is None:
            return None
        previous_status = chatbot.status
        chatbot.status = "suspended"
        new_status = chatbot.status
    elif policy.action == "suspend_widget":
        if widget is None:
            return None
        previous_status = widget.status
        widget.status = "inactive"
        new_status = widget.status
    elif policy.action == "suspend_organization":
        previous_status = organization.status
        organization.status = "suspended"
        new_status = organization.status
    elif policy.action == "read_only":
        previous_status = "active"
        new_status = "read_only"
    return _create_log(
        db,
        organization_id=str(organization.id),
        chatbot_id=(str(chatbot.id) if chatbot else None),
        widget_id=(str(widget.id) if widget else None),
        policy=policy,
        reason=reason,
        previous_status=previous_status,
        new_status=new_status,
        metadata_json=metadata_json,
    )


def evaluate_billing_enforcement_for_contract(
    db: Session,
    *,
    contract: Contract,
    usage_percent: float | None,
) -> None:
    _ensure_default_policies(db)
    policy = db.execute(
        select(AutoEnforcementPolicy).where(
            AutoEnforcementPolicy.policy_type == "billing_over_limit",
            AutoEnforcementPolicy.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if policy is None:
        return
    if not contract.is_over_limit:
        return
    plan = getattr(contract, "plan", None)
    overage_policy = getattr(plan, "overage_policy", "block") if plan is not None else "block"
    if overage_policy != "block":
        return
    organization = db.execute(select(Organization).where(Organization.id == contract.organization_id)).scalar_one_or_none()
    if organization is None:
        return
    chatbot = None
    if policy.action == "suspend_chat":
        chatbot = db.execute(
            select(ChatbotSetting)
            .where(ChatbotSetting.organization_id == contract.organization_id, ChatbotSetting.status == "active")
            .order_by(ChatbotSetting.created_at.asc())
            .limit(1)
        ).scalar_one_or_none()
    reason = "Usage exceeded contract limit and overage policy is block."
    _apply_policy_action(
        db,
        policy=policy,
        organization=organization,
        chatbot=chatbot,
        widget=None,
        reason=reason,
        metadata_json={"contractId": str(contract.id), "usagePercent": usage_percent, "billingStatus": contract.billing_status},
    )


def evaluate_contract_expiry_enforcement(
    db: Session,
    *,
    contract: Contract,
) -> None:
    _ensure_default_policies(db)
    policy = db.execute(
        select(AutoEnforcementPolicy).where(
            AutoEnforcementPolicy.policy_type == "contract_expired",
            AutoEnforcementPolicy.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if policy is None:
        return
    today = date.today()
    is_expired = bool(
        (contract.end_date is not None and contract.end_date < today)
        or contract.status == "expired"
        or contract.billing_status in {"overdue", "suspended"}
    )
    if not is_expired:
        return
    organization = db.execute(select(Organization).where(Organization.id == contract.organization_id)).scalar_one_or_none()
    if organization is None:
        return
    _apply_policy_action(
        db,
        policy=policy,
        organization=organization,
        chatbot=None,
        widget=None,
        reason="Contract expired or billing status is overdue/suspended.",
        metadata_json={"contractId": str(contract.id), "contractStatus": contract.status, "billingStatus": contract.billing_status},
    )


def evaluate_api_error_spike_for_chatbot(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> None:
    _ensure_default_policies(db)
    policy = db.execute(
        select(AutoEnforcementPolicy).where(
            AutoEnforcementPolicy.policy_type == "api_error_spike",
            AutoEnforcementPolicy.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if policy is None:
        return
    window_minutes = policy.error_window_minutes or 15
    error_threshold = policy.error_count_threshold or 5
    since = datetime.now(UTC) - timedelta(minutes=window_minutes)
    error_count = int(
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
    if error_count < error_threshold:
        return
    organization = db.execute(select(Organization).where(Organization.id == organization_id)).scalar_one_or_none()
    chatbot = db.execute(select(ChatbotSetting).where(ChatbotSetting.id == chatbot_id)).scalar_one_or_none()
    if organization is None or chatbot is None:
        return
    _apply_policy_action(
        db,
        policy=policy,
        organization=organization,
        chatbot=chatbot if policy.action == "suspend_chat" else None,
        widget=None,
        reason=f"LLM API errors spiked within {window_minutes} minutes.",
        metadata_json={"errorWindowMinutes": window_minutes, "errorCountThreshold": error_threshold, "errorCount": error_count},
    )


def evaluate_security_risk_event(
    db: Session,
    *,
    organization_id: str | None,
    event_code: str,
) -> None:
    _ensure_default_policies(db)
    policy = db.execute(
        select(AutoEnforcementPolicy).where(
            AutoEnforcementPolicy.policy_type == "security_risk",
            AutoEnforcementPolicy.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if policy is None:
        return
    window_minutes = policy.error_window_minutes or 15
    threshold = policy.error_count_threshold or 3
    since = datetime.now(UTC) - timedelta(minutes=window_minutes)
    count = int(
        db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.action.in_(["super_admin.impersonation.failed"]),
                AuditLog.created_at >= since,
                AuditLog.metadata_json["errorCode"].astext == event_code,
            )
        ).scalar_one()
        or 0
    )
    if count < threshold:
        return
    safe_create_notification(
        db,
        type_value="security",
        severity="warning",
        title="Security risk pattern detected",
        message=f"Repeated security-related failures were detected: {event_code}",
        organization_id=organization_id,
        metadata={"eventCode": event_code, "count": count, "windowMinutes": window_minutes},
        dedupe_within_minutes=30,
    )


def resolve_enforcement_log_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    log_id: str,
    reason: str,
) -> AutoEnforcementLogItem:
    log_id = _validate_uuid_or_404(log_id, "ENFORCEMENT_LOG_NOT_FOUND")
    row = db.execute(
        select(AutoEnforcementLog, AutoEnforcementPolicy.policy_type)
        .join(AutoEnforcementPolicy, AutoEnforcementPolicy.id == AutoEnforcementLog.policy_id)
        .where(AutoEnforcementLog.id == log_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ENFORCEMENT_LOG_NOT_FOUND")
    log, policy_type = row
    if log.resolved_at is not None:
        return _log_item(log, policy_type)

    if log.action == "suspend_organization":
        org = db.execute(select(Organization).where(Organization.id == log.organization_id)).scalar_one_or_none()
        if org is not None and log.previous_status:
            org.status = log.previous_status
    elif log.action == "suspend_chat" and log.chatbot_id:
        chatbot = db.execute(select(ChatbotSetting).where(ChatbotSetting.id == log.chatbot_id)).scalar_one_or_none()
        if chatbot is not None and log.previous_status:
            chatbot.status = log.previous_status
    elif log.action == "suspend_widget" and log.widget_id:
        widget = db.execute(select(WidgetDeployment).where(WidgetDeployment.id == log.widget_id)).scalar_one_or_none()
        if widget is not None and log.previous_status:
            widget.status = log.previous_status

    log.resolved_at = datetime.now(UTC).isoformat()
    log.resolved_by = principal.admin_id
    metadata = dict(log.metadata_json or {})
    metadata["resolveReason"] = reason.strip()
    log.metadata_json = metadata
    _audit(
        db,
        organization_id=str(log.organization_id),
        admin_id=principal.admin_id,
        action="enforcement.resolved",
        target_type="auto_enforcement_log",
        target_id=str(log.id),
        metadata_json={"policyType": policy_type, "action": log.action, "reason": reason.strip()},
    )
    safe_create_notification(
        db,
        type_value="system",
        severity="info",
        title="Auto enforcement resolved",
        message=reason.strip(),
        organization_id=str(log.organization_id),
        chatbot_id=(str(log.chatbot_id) if log.chatbot_id else None),
        metadata={"logId": str(log.id), "policyType": policy_type, "action": log.action},
        dedupe_within_minutes=5,
    )
    db.commit()
    db.refresh(log)
    return _log_item(log, policy_type)


def get_active_enforcement_records(db: Session, *, organization_id: str, chatbot_id: str | None = None, widget_id: str | None = None) -> list[AutoEnforcementLog]:
    stmt = select(AutoEnforcementLog).where(
        AutoEnforcementLog.organization_id == organization_id,
        AutoEnforcementLog.resolved_at.is_(None),
    )
    if chatbot_id:
        stmt = stmt.where(or_(AutoEnforcementLog.chatbot_id == chatbot_id, AutoEnforcementLog.chatbot_id.is_(None)))
    if widget_id:
        stmt = stmt.where(or_(AutoEnforcementLog.widget_id == widget_id, AutoEnforcementLog.widget_id.is_(None)))
    return list(db.execute(stmt).scalars().all())


def ensure_runtime_access_for_chatbot(db: Session, *, chatbot_id: str) -> tuple[Organization, ChatbotSetting]:
    chatbot = db.execute(select(ChatbotSetting).where(ChatbotSetting.id == chatbot_id, ChatbotSetting.deleted_at.is_(None))).scalar_one_or_none()
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    organization = db.execute(select(Organization).where(Organization.id == chatbot.organization_id)).scalar_one_or_none()
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")
    latest_contract = db.execute(
        select(Contract)
        .where(Contract.organization_id == organization.id)
        .order_by(Contract.start_date.desc(), Contract.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if latest_contract is not None:
        previous_status = organization.status
        evaluate_contract_expiry_enforcement(db, contract=latest_contract)
        if organization.status != previous_status:
            db.commit()
            db.refresh(organization)
    if organization.status in {"suspended", "expired"}:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=GENERIC_RUNTIME_BLOCK_MESSAGE)
    if chatbot.status != "active":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=GENERIC_RUNTIME_BLOCK_MESSAGE)
    active_logs = get_active_enforcement_records(db, organization_id=str(organization.id), chatbot_id=str(chatbot.id))
    if any(log.action in {"read_only", "suspend_organization", "suspend_chat"} for log in active_logs):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=GENERIC_RUNTIME_BLOCK_MESSAGE)
    return organization, chatbot


def ensure_runtime_access_for_widget(db: Session, *, chatbot_id: str) -> tuple[Organization, ChatbotSetting]:
    organization, chatbot = ensure_runtime_access_for_chatbot(db, chatbot_id=chatbot_id)
    widget = db.execute(
        select(WidgetDeployment)
        .where(WidgetDeployment.chatbot_id == chatbot.id)
        .order_by(WidgetDeployment.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if widget is not None and widget.status != "active":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=GENERIC_RUNTIME_BLOCK_MESSAGE)
    active_logs = get_active_enforcement_records(
        db,
        organization_id=str(organization.id),
        chatbot_id=str(chatbot.id),
        widget_id=(str(widget.id) if widget else None),
    )
    if any(log.action in {"read_only", "suspend_widget"} for log in active_logs):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=GENERIC_RUNTIME_BLOCK_MESSAGE)
    return organization, chatbot
