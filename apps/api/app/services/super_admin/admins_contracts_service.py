import re
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.core.security import hash_password
from app.repositories.logs.audit_log_repository import create_audit_log
from app.repositories.super_admin.admins_contracts_repository import (
    create_admin,
    create_contract,
    get_admin_by_id,
    get_admin_by_email,
    get_admin_by_org_email,
    get_contract_by_id,
    get_organization_by_id,
    get_plan_by_id,
    list_admins_by_organization,
    list_contracts_by_organization,
)
from app.schemas.super_admin_accounts_contracts import (
    SuperAdminAdminResetPasswordRequest,
    SuperAdminAdminResetPasswordResponse,
    SuperAdminContractCreateRequest,
    SuperAdminContractItem,
    SuperAdminContractListResponse,
    SuperAdminContractResponse,
    SuperAdminContractUpdateRequest,
    SuperAdminOrgAdminCreateRequest,
    SuperAdminOrgAdminItem,
    SuperAdminOrgAdminListResponse,
    SuperAdminOrgAdminResponse,
    SuperAdminOrgAdminUpdateRequest,
)

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ADMIN_STATUS_SET = {"active", "inactive", "disabled"}
CONTRACT_STATUS_SET = {"active", "trial", "suspended", "expired"}
CONTRACT_BILLING_STATUS_SET = {"active", "overdue", "suspended"}
INSTITUTION_ADMIN_ROLE = "institution_admin"
SUPER_ADMIN_ROLE = "super_admin"


def _validate_uuid_or_404(entity_id: str, detail: str) -> str:
    try:
        return str(uuid.UUID(entity_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _normalize_required_text(value: str, detail: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)
    return normalized


def _normalize_email_or_422(email: str) -> str:
    normalized = email.strip().lower()
    if not EMAIL_PATTERN.match(normalized):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_EMAIL")
    return normalized


def _validate_admin_status(status_value: str) -> None:
    if status_value not in ADMIN_STATUS_SET:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ADMIN_STATUS")


def _validate_contract_status(status_value: str) -> None:
    if status_value not in CONTRACT_STATUS_SET:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_CONTRACT_STATUS")


def _validate_billing_status(status_value: str) -> None:
    if status_value not in CONTRACT_BILLING_STATUS_SET:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_BILLING_STATUS")


def _resolve_password(password: str | None, temporary_password: str | None) -> str:
    resolved = password or temporary_password
    if not resolved:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PASSWORD_REQUIRED")
    if len(resolved) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PASSWORD_TOO_SHORT")
    return resolved


def _validate_date_range_or_422(start_date, end_date) -> None:
    if end_date is not None and start_date > end_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_CONTRACT_DATE_RANGE")


def _resolve_contract_defaults(db: Session, *, plan_id: str | None):
    if plan_id is None:
        return None
    normalized_plan_id = _validate_uuid_or_404(plan_id, "PLAN_NOT_FOUND")
    plan = get_plan_by_id(db, plan_id=normalized_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PLAN_NOT_FOUND")
    return plan


def _to_admin_item(row) -> SuperAdminOrgAdminItem:
    return SuperAdminOrgAdminItem(
        id=str(row.id),
        email=row.email,
        name=row.name,
        role=row.role,
        status=row.status,  # type: ignore[arg-type]
        organization_id=(str(row.organization_id) if row.organization_id else None),
        must_change_password=bool(row.must_change_password),
        last_login_at=(row.last_login_at.isoformat() if row.last_login_at else None),
        created_at=row.created_at.isoformat(),
    )


def _to_admin_response(row) -> SuperAdminOrgAdminResponse:
    return SuperAdminOrgAdminResponse(
        id=str(row.id),
        email=row.email,
        name=row.name,
        role=row.role,
        status=row.status,  # type: ignore[arg-type]
        organization_id=(str(row.organization_id) if row.organization_id else None),
        must_change_password=bool(row.must_change_password),
        last_login_at=(row.last_login_at.isoformat() if row.last_login_at else None),
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _to_contract_item(row) -> SuperAdminContractItem:
    return SuperAdminContractItem(
        id=str(row.id),
        organization_id=str(row.organization_id),
        plan_id=(str(row.plan_id) if getattr(row, "plan_id", None) else None),
        plan_name=row.plan_name,
        start_date=row.start_date,
        end_date=row.end_date,
        current_period_start=row.current_period_start,
        current_period_end=row.current_period_end,
        current_usage_tokens=int(row.current_usage_tokens or 0),
        current_usage_cost=float(row.current_usage_cost or 0),
        is_over_limit=bool(row.is_over_limit),
        billing_status=row.billing_status,  # type: ignore[arg-type]
        overage_policy=(getattr(getattr(row, "plan", None), "overage_policy", None)),
        monthly_conversation_limit=row.monthly_conversation_limit,
        document_limit=row.document_limit,
        website_limit=row.website_limit,
        chatbot_limit=row.chatbot_limit,
        widget_limit=row.widget_limit,
        status=row.status,  # type: ignore[arg-type]
        created_at=row.created_at.isoformat(),
    )


def _to_contract_response(row) -> SuperAdminContractResponse:
    return SuperAdminContractResponse(
        id=str(row.id),
        organization_id=str(row.organization_id),
        plan_id=(str(row.plan_id) if getattr(row, "plan_id", None) else None),
        plan_name=row.plan_name,
        start_date=row.start_date,
        end_date=row.end_date,
        current_period_start=row.current_period_start,
        current_period_end=row.current_period_end,
        current_usage_tokens=int(row.current_usage_tokens or 0),
        current_usage_cost=float(row.current_usage_cost or 0),
        is_over_limit=bool(row.is_over_limit),
        billing_status=row.billing_status,  # type: ignore[arg-type]
        overage_policy=(getattr(getattr(row, "plan", None), "overage_policy", None)),
        monthly_conversation_limit=row.monthly_conversation_limit,
        document_limit=row.document_limit,
        website_limit=row.website_limit,
        chatbot_limit=row.chatbot_limit,
        widget_limit=row.widget_limit,
        status=row.status,  # type: ignore[arg-type]
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def list_org_admins_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
) -> SuperAdminOrgAdminListResponse:
    _ = principal
    organization_id = _validate_uuid_or_404(organization_id, "ORGANIZATION_NOT_FOUND")
    organization = get_organization_by_id(db, organization_id=organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    rows = list_admins_by_organization(db, organization_id=organization_id)
    return SuperAdminOrgAdminListResponse(items=[_to_admin_item(row) for row in rows])


def create_org_admin_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
    body: SuperAdminOrgAdminCreateRequest,
) -> SuperAdminOrgAdminResponse:
    organization_id = _validate_uuid_or_404(organization_id, "ORGANIZATION_NOT_FOUND")
    organization = get_organization_by_id(db, organization_id=organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    email = _normalize_email_or_422(body.email)
    name = _normalize_required_text(body.name, "INVALID_ADMIN_NAME")
    _validate_admin_status(body.status)
    password = _resolve_password(body.password, body.temporary_password)

    duplicated = get_admin_by_org_email(db, organization_id=organization_id, email=email)
    if duplicated is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ADMIN_EMAIL_ALREADY_EXISTS")
    global_duplicate = get_admin_by_email(db, email=email)
    if global_duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ADMIN_EMAIL_ALREADY_EXISTS")

    row = create_admin(
        db,
        organization_id=organization_id,
        email=email,
        name=name,
        role=INSTITUTION_ADMIN_ROLE,
        status=body.status,
        password_hash=hash_password(password),
        must_change_password=bool(body.temporary_password and not body.password),
    )

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="super_admin.admin.create",
        target_type="admin",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "email": row.email,
            "role": row.role,
            "status": row.status,
        },
    )
    db.commit()
    db.refresh(row)
    return _to_admin_response(row)


def update_admin_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    admin_id: str,
    body: SuperAdminOrgAdminUpdateRequest,
) -> SuperAdminOrgAdminResponse:
    admin_id = _validate_uuid_or_404(admin_id, "ADMIN_NOT_FOUND")
    row = get_admin_by_id(db, admin_id=admin_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ADMIN_NOT_FOUND")
    if row.role == SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPER_ADMIN_UPDATE_FORBIDDEN")
    if row.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ADMIN_ORGANIZATION_SCOPE_REQUIRED")

    changed_fields: list[str] = []
    if body.name is not None:
        row.name = _normalize_required_text(body.name, "INVALID_ADMIN_NAME")
        changed_fields.append("name")
    if body.email is not None:
        normalized_email = _normalize_email_or_422(body.email)
        duplicated = get_admin_by_org_email(
            db,
            organization_id=str(row.organization_id),
            email=normalized_email,
            exclude_admin_id=str(row.id),
        )
        if duplicated is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ADMIN_EMAIL_ALREADY_EXISTS")
        global_duplicate = get_admin_by_email(db, email=normalized_email, exclude_admin_id=str(row.id))
        if global_duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ADMIN_EMAIL_ALREADY_EXISTS")
        row.email = normalized_email
        changed_fields.append("email")
    if body.status is not None:
        _validate_admin_status(body.status)
        row.status = body.status
        changed_fields.append("status")

    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.admin.update",
        target_type="admin",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"changedFields": changed_fields},
    )
    db.commit()
    db.refresh(row)
    return _to_admin_response(row)


def reset_admin_password_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    admin_id: str,
    body: SuperAdminAdminResetPasswordRequest,
) -> SuperAdminAdminResetPasswordResponse:
    admin_id = _validate_uuid_or_404(admin_id, "ADMIN_NOT_FOUND")
    row = get_admin_by_id(db, admin_id=admin_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ADMIN_NOT_FOUND")
    if row.role == SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPER_ADMIN_RESET_FORBIDDEN")
    if row.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ADMIN_ORGANIZATION_SCOPE_REQUIRED")

    password = _resolve_password(body.new_password, body.temporary_password)
    row.password_hash = hash_password(password)
    row.must_change_password = bool(body.temporary_password and not body.new_password)
    row.last_login_at = None

    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.admin.reset_password",
        target_type="admin",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"passwordResetAt": datetime.now().isoformat()},
    )
    db.commit()
    db.refresh(row)
    return SuperAdminAdminResetPasswordResponse(
        id=str(row.id),
        status=row.status,  # type: ignore[arg-type]
        updated_at=row.updated_at.isoformat(),
    )


def disable_admin_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    admin_id: str,
) -> SuperAdminOrgAdminResponse:
    admin_id = _validate_uuid_or_404(admin_id, "ADMIN_NOT_FOUND")
    row = get_admin_by_id(db, admin_id=admin_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ADMIN_NOT_FOUND")
    if row.role == SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPER_ADMIN_DISABLE_FORBIDDEN")
    if row.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ADMIN_ORGANIZATION_SCOPE_REQUIRED")

    row.status = "disabled"
    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.admin.disable",
        target_type="admin",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"status": "disabled"},
    )
    db.commit()
    db.refresh(row)
    return _to_admin_response(row)


def list_org_contracts_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
) -> SuperAdminContractListResponse:
    _ = principal
    organization_id = _validate_uuid_or_404(organization_id, "ORGANIZATION_NOT_FOUND")
    organization = get_organization_by_id(db, organization_id=organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    rows = list_contracts_by_organization(db, organization_id=organization_id)
    return SuperAdminContractListResponse(items=[_to_contract_item(row) for row in rows])


def create_contract_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
    body: SuperAdminContractCreateRequest,
) -> SuperAdminContractResponse:
    organization_id = _validate_uuid_or_404(organization_id, "ORGANIZATION_NOT_FOUND")
    organization = get_organization_by_id(db, organization_id=organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    _validate_contract_status(body.status)
    _validate_billing_status(body.billing_status)
    _validate_date_range_or_422(body.start_date, body.end_date)
    plan = _resolve_contract_defaults(db, plan_id=body.plan_id)
    plan_name = body.plan_name
    if plan_name is None and plan is not None:
        plan_name = plan.name
    if plan_name is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_PLAN_NAME")

    current_period_start = body.current_period_start or body.start_date
    current_period_end = body.current_period_end or body.end_date

    row = create_contract(
        db,
        organization_id=organization_id,
        plan_id=(str(plan.id) if plan is not None else None),
        plan_name=_normalize_required_text(plan_name, "INVALID_PLAN_NAME"),
        start_date=body.start_date,
        end_date=body.end_date,
        current_period_start=current_period_start,
        current_period_end=current_period_end,
        current_usage_tokens=0,
        current_usage_cost=0.0,
        is_over_limit=False,
        billing_status=body.billing_status,
        monthly_conversation_limit=(
            body.monthly_conversation_limit if body.monthly_conversation_limit is not None else getattr(plan, "monthly_conversation_limit", None)
        ),
        document_limit=body.document_limit,
        website_limit=body.website_limit,
        chatbot_limit=(body.chatbot_limit if body.chatbot_limit is not None else getattr(plan, "chatbot_limit", None)),
        widget_limit=body.widget_limit,
        status=body.status,
    )

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="super_admin.contract.create",
        target_type="contract",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "planName": row.plan_name,
            "planId": (str(row.plan_id) if row.plan_id else None),
            "status": row.status,
            "billingStatus": row.billing_status,
            "startDate": row.start_date.isoformat(),
            "endDate": (row.end_date.isoformat() if row.end_date else None),
        },
    )
    db.commit()
    db.refresh(row)
    return _to_contract_response(row)


def update_contract_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    contract_id: str,
    body: SuperAdminContractUpdateRequest,
) -> SuperAdminContractResponse:
    contract_id = _validate_uuid_or_404(contract_id, "CONTRACT_NOT_FOUND")
    row = get_contract_by_id(db, contract_id=contract_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CONTRACT_NOT_FOUND")

    changed_fields: list[str] = []
    fields_set = set(body.model_fields_set)

    if "plan_name" in fields_set:
        if body.plan_name is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_PLAN_NAME")
        row.plan_name = _normalize_required_text(body.plan_name, "INVALID_PLAN_NAME")
        changed_fields.append("plan_name")
    if "plan_id" in fields_set:
        if body.plan_id is None:
            row.plan_id = None
            changed_fields.append("plan_id")
        else:
            plan = _resolve_contract_defaults(db, plan_id=body.plan_id)
            row.plan_id = plan.id
            row.plan_name = plan.name
            if "monthly_conversation_limit" not in fields_set and plan.monthly_conversation_limit is not None:
                row.monthly_conversation_limit = plan.monthly_conversation_limit
            if "chatbot_limit" not in fields_set and plan.chatbot_limit is not None:
                row.chatbot_limit = plan.chatbot_limit
            changed_fields.append("plan_id")
    if "start_date" in fields_set:
        if body.start_date is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_CONTRACT_START_DATE")
        row.start_date = body.start_date
        changed_fields.append("start_date")
    if "end_date" in fields_set:
        row.end_date = body.end_date
        changed_fields.append("end_date")
    if "current_period_start" in fields_set:
        row.current_period_start = body.current_period_start
        changed_fields.append("current_period_start")
    if "current_period_end" in fields_set:
        row.current_period_end = body.current_period_end
        changed_fields.append("current_period_end")
    if "monthly_conversation_limit" in fields_set:
        row.monthly_conversation_limit = body.monthly_conversation_limit
        changed_fields.append("monthly_conversation_limit")
    if "document_limit" in fields_set:
        row.document_limit = body.document_limit
        changed_fields.append("document_limit")
    if "website_limit" in fields_set:
        row.website_limit = body.website_limit
        changed_fields.append("website_limit")
    if "chatbot_limit" in fields_set:
        row.chatbot_limit = body.chatbot_limit
        changed_fields.append("chatbot_limit")
    if "widget_limit" in fields_set:
        row.widget_limit = body.widget_limit
        changed_fields.append("widget_limit")
    if "status" in fields_set:
        if body.status is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_CONTRACT_STATUS")
        _validate_contract_status(body.status)
        row.status = body.status
        changed_fields.append("status")
    if "billing_status" in fields_set:
        if body.billing_status is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_BILLING_STATUS")
        _validate_billing_status(body.billing_status)
        row.billing_status = body.billing_status
        changed_fields.append("billing_status")
    if "is_over_limit" in fields_set:
        row.is_over_limit = bool(body.is_over_limit)
        changed_fields.append("is_over_limit")

    _validate_date_range_or_422(row.start_date, row.end_date)
    if row.current_period_start is not None and row.current_period_end is not None:
        _validate_date_range_or_422(row.current_period_start, row.current_period_end)

    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.contract.update",
        target_type="contract",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"changedFields": changed_fields},
    )
    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="billing.contract.update",
        target_type="contract",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"changedFields": changed_fields},
    )
    db.commit()
    db.refresh(row)
    return _to_contract_response(row)
