import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import BillingAlert, Organization, Plan
from app.repositories.billing_repository import (
    count_active_chatbots,
    count_period_conversations,
    get_active_contract_for_org,
    get_contract_with_plan_by_id,
    get_plan_by_id,
    get_recent_alert,
    list_contracts_with_plan,
    list_plans,
    list_recent_billing_alerts,
    summarize_llm_usage,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.billing import (
    AdminBillingUsageResponse,
    BillingAlertItem,
    BillingAlertListResponse,
    BillingSummaryItem,
    BillingUsageSnapshot,
    PlanCreateRequest,
    PlanItem,
    PlanListResponse,
    PlanUpdateRequest,
    SuperAdminBillingByOrganizationResponse,
    SuperAdminBillingSummaryResponse,
)
from app.services.notification_service import notify_billing_threshold
from app.services.enforcement_service import (
    evaluate_billing_enforcement_for_contract,
    evaluate_contract_expiry_enforcement,
)
from app.services.admin.scope_service import require_institution_organization_id

VALID_OVERAGE_POLICIES = {"block", "allow_with_charge"}
VALID_BILLING_STATUSES = {"active", "overdue", "suspended"}


def _resolve_audit_organization_id(db: Session) -> str:
    row = db.execute(select(Organization.id).order_by(Organization.created_at.asc()).limit(1)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ORGANIZATION_REQUIRED_FOR_AUDIT")
    return str(row)


def _audit(
    db: Session,
    *,
    principal: AdminPrincipal,
    action: str,
    target_type: str,
    target_id: str | None,
    metadata_json: dict,
) -> None:
    create_audit_log(
        db,
        organization_id=_resolve_audit_organization_id(db),
        admin_id=principal.admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        result="success",
        request_id=None,
        metadata_json=metadata_json,
    )


def _validate_uuid_or_404(value: str, detail: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _to_plan_item(row: Plan) -> PlanItem:
    return PlanItem(
        id=str(row.id),
        name=row.name,
        description=row.description,
        monthly_base_fee=float(row.monthly_base_fee or 0),
        included_tokens=int(row.included_tokens or 0),
        price_per_1k_tokens=float(row.price_per_1k_tokens or 0),
        chatbot_limit=row.chatbot_limit,
        monthly_conversation_limit=row.monthly_conversation_limit,
        overage_policy=row.overage_policy,  # type: ignore[arg-type]
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
    )


def list_plans_service(db: Session, *, principal: AdminPrincipal) -> PlanListResponse:
    _ = principal
    return PlanListResponse(items=[_to_plan_item(row) for row in list_plans(db)])


def create_plan_service(db: Session, *, principal: AdminPrincipal, body: PlanCreateRequest) -> PlanItem:
    if body.overage_policy not in VALID_OVERAGE_POLICIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_OVERAGE_POLICY")
    row = Plan(
        name=body.name.strip(),
        description=(body.description.strip() if body.description else None),
        monthly_base_fee=body.monthly_base_fee,
        included_tokens=body.included_tokens,
        price_per_1k_tokens=body.price_per_1k_tokens,
        chatbot_limit=body.chatbot_limit,
        monthly_conversation_limit=body.monthly_conversation_limit,
        overage_policy=body.overage_policy,
        is_active=body.is_active,
    )
    db.add(row)
    db.flush()
    _audit(
        db,
        principal=principal,
        action="billing.plan.create",
        target_type="plan",
        target_id=str(row.id),
        metadata_json={"name": row.name, "includedTokens": row.included_tokens},
    )
    db.commit()
    db.refresh(row)
    return _to_plan_item(row)


def update_plan_service(db: Session, *, principal: AdminPrincipal, plan_id: str, body: PlanUpdateRequest) -> PlanItem:
    plan_id = _validate_uuid_or_404(plan_id, "PLAN_NOT_FOUND")
    row = get_plan_by_id(db, plan_id=plan_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PLAN_NOT_FOUND")
    if body.overage_policy is not None and body.overage_policy not in VALID_OVERAGE_POLICIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_OVERAGE_POLICY")

    if body.name is not None:
        row.name = body.name.strip()
    if body.description is not None:
        row.description = body.description.strip() or None
    if body.monthly_base_fee is not None:
        row.monthly_base_fee = body.monthly_base_fee
    if body.included_tokens is not None:
        row.included_tokens = body.included_tokens
    if body.price_per_1k_tokens is not None:
        row.price_per_1k_tokens = body.price_per_1k_tokens
    if body.chatbot_limit is not None:
        row.chatbot_limit = body.chatbot_limit
    if body.monthly_conversation_limit is not None:
        row.monthly_conversation_limit = body.monthly_conversation_limit
    if body.overage_policy is not None:
        row.overage_policy = body.overage_policy
    if body.is_active is not None:
        row.is_active = body.is_active

    _audit(
        db,
        principal=principal,
        action="billing.plan.update",
        target_type="plan",
        target_id=str(row.id),
        metadata_json={"name": row.name, "isActive": row.is_active},
    )
    db.commit()
    db.refresh(row)
    return _to_plan_item(row)


def _ensure_alert(
    db: Session,
    *,
    organization_id: str,
    contract_id: str,
    metric_key: str,
    level: str,
    message: str,
    threshold_percent: float | None,
    current_value: float,
    limit_value: float | None,
    period_start: date | None,
) -> None:
    existing = get_recent_alert(
        db,
        contract_id=contract_id,
        metric_key=metric_key,
        level=level,
        period_start=period_start,
    )
    if existing is not None:
        return
    db.add(
        BillingAlert(
            organization_id=organization_id,
            contract_id=contract_id,
            level=level,
            metric_key=metric_key,
            message=message,
            threshold_percent=threshold_percent,
            current_value=current_value,
            limit_value=limit_value,
        )
    )
    notify_billing_threshold(
        db,
        organization_id=organization_id,
        contract_id=contract_id,
        level=level,
        metric_key=metric_key,
        current_value=current_value,
        limit_value=limit_value,
    )


def calculate_contract_billing_service(
    db: Session,
    *,
    contract_id: str,
) -> BillingSummaryItem:
    contract_id = _validate_uuid_or_404(contract_id, "CONTRACT_NOT_FOUND")
    row = get_contract_with_plan_by_id(db, contract_id=contract_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CONTRACT_NOT_FOUND")
    contract, plan, organization = row

    period_start = contract.current_period_start or contract.start_date
    period_end = contract.current_period_end or contract.end_date
    contract.current_period_start = period_start
    contract.current_period_end = period_end
    usage = summarize_llm_usage(
        db,
        organization_id=str(contract.organization_id),
        period_start=period_start,
        period_end=period_end,
    )
    total_tokens = int(usage.total_tokens or 0)
    estimated_usage_cost = float(usage.estimated_cost or 0)
    included_tokens = int(plan.included_tokens) if plan else 0
    overage_tokens = max(0, total_tokens - included_tokens)
    price_per_1k_tokens = float(plan.price_per_1k_tokens or 0) if plan else 0
    overage_cost = round((overage_tokens / 1000) * price_per_1k_tokens, 6)
    base_fee = float(plan.monthly_base_fee or 0) if plan else 0
    total_estimated_charge = round(base_fee + overage_cost, 6)

    monthly_conversation_count = count_period_conversations(
        db,
        organization_id=str(contract.organization_id),
        period_start=period_start,
        period_end=period_end,
    )
    active_chatbot_count = count_active_chatbots(db, organization_id=str(contract.organization_id))

    is_token_over = overage_tokens > 0
    is_conversation_over = (
        contract.monthly_conversation_limit is not None
        and monthly_conversation_count >= contract.monthly_conversation_limit
    )
    is_chatbot_over = contract.chatbot_limit is not None and active_chatbot_count > contract.chatbot_limit
    is_over_limit = is_token_over or is_conversation_over or is_chatbot_over

    contract.current_usage_tokens = total_tokens
    contract.current_usage_cost = overage_cost
    contract.is_over_limit = is_over_limit
    if contract.billing_status not in VALID_BILLING_STATUSES:
        contract.billing_status = "active"

    if included_tokens > 0:
        token_rate = (total_tokens / included_tokens) * 100
        if token_rate >= 100:
            _ensure_alert(
                db,
                organization_id=str(contract.organization_id),
                contract_id=str(contract.id),
                metric_key="included_tokens",
                level="alert" if token_rate == 100 else "critical",
                message="Token usage reached or exceeded the plan limit.",
                threshold_percent=100,
                current_value=float(total_tokens),
                limit_value=float(included_tokens),
                period_start=period_start,
            )
        elif token_rate >= 80:
            _ensure_alert(
                db,
                organization_id=str(contract.organization_id),
                contract_id=str(contract.id),
                metric_key="included_tokens",
                level="warning",
                message="Token usage reached 80% of the included limit.",
                threshold_percent=80,
                current_value=float(total_tokens),
                limit_value=float(included_tokens),
                period_start=period_start,
            )
    if contract.monthly_conversation_limit:
        conversation_rate = (monthly_conversation_count / contract.monthly_conversation_limit) * 100
        if conversation_rate >= 100:
            _ensure_alert(
                db,
                organization_id=str(contract.organization_id),
                contract_id=str(contract.id),
                metric_key="monthly_conversation_limit",
                level="alert" if conversation_rate == 100 else "critical",
                message="Conversation usage reached or exceeded the monthly limit.",
                threshold_percent=100,
                current_value=float(monthly_conversation_count),
                limit_value=float(contract.monthly_conversation_limit),
                period_start=period_start,
            )
        elif conversation_rate >= 80:
            _ensure_alert(
                db,
                organization_id=str(contract.organization_id),
                contract_id=str(contract.id),
                metric_key="monthly_conversation_limit",
                level="warning",
                message="Conversation usage reached 80% of the monthly limit.",
                threshold_percent=80,
                current_value=float(monthly_conversation_count),
                limit_value=float(contract.monthly_conversation_limit),
                period_start=period_start,
            )

    usage_percent = None
    if included_tokens > 0:
        usage_percent = round((total_tokens / included_tokens) * 100, 2)
    evaluate_billing_enforcement_for_contract(db, contract=contract, usage_percent=usage_percent)
    evaluate_contract_expiry_enforcement(db, contract=contract)
    db.flush()
    return BillingSummaryItem(
        organization_id=str(contract.organization_id),
        organization_name=organization.name,
        contract_id=str(contract.id),
        plan_id=(str(plan.id) if plan else None),
        plan_name=(plan.name if plan else contract.plan_name),
        monthly_base_fee=base_fee,
        total_tokens=total_tokens,
        remaining_tokens=max(0, included_tokens - total_tokens),
        estimated_overage_cost=overage_cost,
        total_estimated_charge=total_estimated_charge,
        is_over_limit=is_over_limit,
        billing_status=contract.billing_status,  # type: ignore[arg-type]
        monthly_conversation_count=monthly_conversation_count,
        monthly_conversation_limit=contract.monthly_conversation_limit,
        active_chatbot_count=active_chatbot_count,
        chatbot_limit=contract.chatbot_limit,
    )


def refresh_contract_billing_snapshot(
    db: Session,
    *,
    contract_id: str,
    principal: AdminPrincipal | None = None,
) -> BillingSummaryItem:
    summary = calculate_contract_billing_service(db, contract_id=contract_id)
    if principal is not None:
        _audit(
            db,
            principal=principal,
            action="billing.usage.calculated",
            target_type="contract",
            target_id=contract_id,
            metadata_json={"organizationId": summary.organization_id, "totalTokens": summary.total_tokens},
        )
    return summary


def get_super_admin_billing_summary_service(db: Session, *, principal: AdminPrincipal) -> SuperAdminBillingSummaryResponse:
    rows = list_contracts_with_plan(db)
    total_monthly = 0.0
    total_overage = 0.0
    over_limit_count = 0
    active_contract_count = 0
    for contract, _, _ in rows:
        summary = calculate_contract_billing_service(db, contract_id=str(contract.id))
        if contract.status == "active":
            active_contract_count += 1
        total_monthly += summary.total_estimated_charge
        total_overage += summary.estimated_overage_cost
        if summary.is_over_limit:
            over_limit_count += 1
    db.commit()
    return SuperAdminBillingSummaryResponse(
        total_monthly_revenue_estimate=round(total_monthly, 6),
        total_overage_estimate=round(total_overage, 6),
        over_limit_organization_count=over_limit_count,
        active_contract_count=active_contract_count,
    )


def get_super_admin_billing_by_organization_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> SuperAdminBillingByOrganizationResponse:
    rows = list_contracts_with_plan(db)
    items = [calculate_contract_billing_service(db, contract_id=str(contract.id)) for contract, _, _ in rows]
    items.sort(key=lambda item: (-item.total_estimated_charge, item.organization_name))
    _ = principal
    db.commit()
    return SuperAdminBillingByOrganizationResponse(items=items)


def get_admin_billing_usage_service(db: Session, *, principal: AdminPrincipal) -> AdminBillingUsageResponse:
    organization_id = require_institution_organization_id(principal)
    contract = get_active_contract_for_org(db, organization_id=organization_id)
    if contract is None:
        return AdminBillingUsageResponse(
            plan=None,
            contract_id=None,
            billing_status=None,
            usage=BillingUsageSnapshot(
                period_start=None,
                period_end=None,
                total_tokens=0,
                included_tokens=0,
                remaining_tokens=0,
                overage_tokens=0,
                estimated_usage_cost=0,
                estimated_overage_cost=0,
                total_estimated_charge=0,
                is_over_limit=False,
                overage_policy=None,
            ),
            monthly_conversation_count=0,
            monthly_conversation_limit=None,
            active_chatbot_count=0,
            chatbot_limit=None,
        )
    summary = calculate_contract_billing_service(db, contract_id=str(contract.id))
    plan = get_plan_by_id(db, plan_id=str(contract.plan_id)) if contract.plan_id else None
    db.commit()
    return AdminBillingUsageResponse(
        plan=(_to_plan_item(plan) if plan else None),
        contract_id=str(contract.id),
        billing_status=contract.billing_status,  # type: ignore[arg-type]
        usage=BillingUsageSnapshot(
            period_start=contract.current_period_start,
            period_end=contract.current_period_end,
            total_tokens=summary.total_tokens,
            included_tokens=int(plan.included_tokens) if plan else 0,
            remaining_tokens=summary.remaining_tokens,
            overage_tokens=max(0, summary.total_tokens - (int(plan.included_tokens) if plan else 0)),
            estimated_usage_cost=float(contract.current_usage_cost or 0),
            estimated_overage_cost=summary.estimated_overage_cost,
            total_estimated_charge=summary.total_estimated_charge,
            is_over_limit=summary.is_over_limit,
            overage_policy=(plan.overage_policy if plan else None),  # type: ignore[arg-type]
        ),
        monthly_conversation_count=summary.monthly_conversation_count,
        monthly_conversation_limit=summary.monthly_conversation_limit,
        active_chatbot_count=summary.active_chatbot_count,
        chatbot_limit=summary.chatbot_limit,
    )


def list_billing_alerts_service(db: Session, *, principal: AdminPrincipal) -> BillingAlertListResponse:
    _ = principal
    rows = list_recent_billing_alerts(db, limit_count=100)
    return BillingAlertListResponse(
        items=[
            BillingAlertItem(
                id=str(row.id),
                organization_id=str(row.organization_id),
                contract_id=str(row.contract_id),
                level=row.level,
                metric_key=row.metric_key,
                message=row.message,
                threshold_percent=row.threshold_percent,
                current_value=row.current_value,
                limit_value=row.limit_value,
                created_at=row.created_at.isoformat(),
            )
            for row in rows
        ]
    )
