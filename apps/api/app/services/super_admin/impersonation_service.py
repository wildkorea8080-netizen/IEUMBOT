import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.core.security import create_impersonation_token
from app.models import Organization
from app.repositories.logs.audit_log_repository import create_audit_log
from app.repositories.super_admin.organizations_repository import get_latest_contract_summary, get_organization_by_id
from app.schemas.super_admin_impersonation import (
    AdminImpersonationEndResponse,
    SuperAdminImpersonationRequest,
    SuperAdminImpersonationResponse,
)
from app.services.notification_service import notify_impersonation_started, safe_create_notification
from app.services.enforcement_service import evaluate_security_risk_event

REDIRECT_URL = "/admin/dashboard?impersonation=1"
END_REDIRECT_URL = "/super-admin/dashboard"


def _validate_organization_id(organization_id: str) -> str:
    try:
        return str(uuid.UUID(organization_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND") from exc


def _resolve_audit_organization_id(db: Session, organization_id: str | None) -> str:
    if organization_id:
        row = get_organization_by_id(db, organization_id=organization_id)
        if row is not None:
            return str(row.id)
    fallback = db.execute(select(Organization.id).order_by(Organization.created_at.asc()).limit(1)).scalar_one_or_none()
    if fallback is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ORGANIZATION_REQUIRED_FOR_AUDIT")
    return str(fallback)


def _audit_impersonation(
    db: Session,
    *,
    principal: AdminPrincipal,
    action: str,
    organization_id: str | None,
    reason: str | None,
    expires_at: datetime | None,
    result: str,
    ip_address: str | None,
    user_agent: str | None,
    error_code: str | None = None,
) -> None:
    create_audit_log(
        db,
        organization_id=_resolve_audit_organization_id(db, organization_id),
        admin_id=principal.admin_id,
        action=action,
        target_type="organization",
        target_id=organization_id,
        result=result,
        request_id=None,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata_json={
            "superAdminId": principal.admin_id,
            "targetOrganizationId": organization_id,
            "reason": reason,
            "expiresAt": expires_at.isoformat() if expires_at else None,
            "sourceRole": principal.source_role,
            "isImpersonating": principal.is_impersonating,
            "errorCode": error_code,
        },
    )


def create_impersonation_session_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
    body: SuperAdminImpersonationRequest,
    ip_address: str | None,
    user_agent: str | None,
) -> SuperAdminImpersonationResponse:
    organization_id = _validate_organization_id(organization_id)
    reason = body.reason.strip()
    if not reason:
        _audit_impersonation(
            db,
            principal=principal,
            action="super_admin.impersonation.failed",
            organization_id=organization_id,
            reason=None,
            expires_at=None,
            result="failed",
            ip_address=ip_address,
            user_agent=user_agent,
            error_code="IMPERSONATION_REASON_REQUIRED",
        )
        evaluate_security_risk_event(db, organization_id=organization_id, event_code="IMPERSONATION_REASON_REQUIRED")
        db.commit()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="IMPERSONATION_REASON_REQUIRED")

    organization = get_organization_by_id(db, organization_id=organization_id)
    if organization is None:
        _audit_impersonation(
            db,
            principal=principal,
            action="super_admin.impersonation.failed",
            organization_id=organization_id,
            reason=reason,
            expires_at=None,
            result="failed",
            ip_address=ip_address,
            user_agent=user_agent,
            error_code="ORGANIZATION_NOT_FOUND",
        )
        evaluate_security_risk_event(db, organization_id=organization_id, event_code="ORGANIZATION_NOT_FOUND")
        db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    if organization.status == "suspended":
        _audit_impersonation(
            db,
            principal=principal,
            action="super_admin.impersonation.failed",
            organization_id=organization_id,
            reason=reason,
            expires_at=None,
            result="failed",
            ip_address=ip_address,
            user_agent=user_agent,
            error_code="IMPERSONATION_SUSPENDED_ORGANIZATION_FORBIDDEN",
        )
        evaluate_security_risk_event(db, organization_id=organization_id, event_code="IMPERSONATION_SUSPENDED_ORGANIZATION_FORBIDDEN")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="IMPERSONATION_SUSPENDED_ORGANIZATION_FORBIDDEN",
        )

    latest_contract = get_latest_contract_summary(db, organization_id=organization_id)
    is_expired_contract = bool(
        latest_contract
        and (
            latest_contract.status == "expired"
            or (latest_contract.end_date is not None and latest_contract.end_date < date.today())
        )
    )
    if is_expired_contract:
        _audit_impersonation(
            db,
            principal=principal,
            action="super_admin.impersonation.failed",
            organization_id=organization_id,
            reason=reason,
            expires_at=None,
            result="failed",
            ip_address=ip_address,
            user_agent=user_agent,
            error_code="IMPERSONATION_EXPIRED_CONTRACT_FORBIDDEN",
        )
        evaluate_security_risk_event(db, organization_id=organization_id, event_code="IMPERSONATION_EXPIRED_CONTRACT_FORBIDDEN")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="IMPERSONATION_EXPIRED_CONTRACT_FORBIDDEN",
        )

    token, expires_at = create_impersonation_token(
        super_admin_id=principal.admin_id,
        target_organization_id=organization_id,
        reason=reason,
    )
    _audit_impersonation(
        db,
        principal=principal,
        action="super_admin.impersonation.start",
        organization_id=organization_id,
        reason=reason,
        expires_at=expires_at,
        result="success",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    notify_impersonation_started(
        db,
        organization_id=organization_id,
        super_admin_id=principal.admin_id,
        reason=reason,
    )
    db.commit()
    return SuperAdminImpersonationResponse(
        impersonation_token=token,
        organization_id=organization_id,
        expires_at=expires_at,
        redirect_url=REDIRECT_URL,
    )


def end_impersonation_session_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    ip_address: str | None,
    user_agent: str | None,
) -> AdminImpersonationEndResponse:
    if not principal.is_impersonating:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IMPERSONATION_SESSION_NOT_ACTIVE")

    expires_at = None
    if principal.impersonation_expires_at:
        try:
            expires_at = datetime.fromisoformat(principal.impersonation_expires_at)
        except ValueError:
            expires_at = datetime.now(UTC)

    _audit_impersonation(
        db,
        principal=principal,
        action="super_admin.impersonation.end",
        organization_id=principal.organization_id,
        reason=principal.impersonation_reason,
        expires_at=expires_at,
        result="success",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    safe_create_notification(
        db,
        type_value="security",
        severity="info",
        title="Support impersonation ended",
        message="Super admin support access ended.",
        organization_id=principal.organization_id,
        metadata={"superAdminId": principal.admin_id, "reason": principal.impersonation_reason},
        dedupe_within_minutes=5,
    )
    db.commit()
    return AdminImpersonationEndResponse(status="ended", redirect_url=END_REDIRECT_URL)
