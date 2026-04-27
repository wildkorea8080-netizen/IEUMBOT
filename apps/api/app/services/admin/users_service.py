import re
import uuid

from fastapi import HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.core.security import hash_password
from app.repositories.admin.users_repository import (
    create_user,
    get_user_by_email,
    get_user_by_id,
    list_users_by_organization,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.admin_users import (
    AdminUserCreateRequest,
    AdminUserItem,
    AdminUserResponse,
    AdminUsersListResponse,
    AdminUserUpdateRequest,
)
from app.services.admin.scope_service import require_institution_organization_id

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
END_USER_ROLE = "user"
USER_STATUS_SET = {"active", "inactive"}


def _validate_uuid_or_404(entity_id: str, detail: str) -> str:
    try:
        return str(uuid.UUID(entity_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _normalize_email_or_422(value: str) -> str:
    normalized = value.strip().lower()
    if not EMAIL_PATTERN.match(normalized):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_USER_EMAIL")
    return normalized


def _validate_status_or_422(status_value: str) -> None:
    if status_value not in USER_STATUS_SET:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_USER_STATUS")


def _validate_role_or_422(role_value: str) -> None:
    if role_value != END_USER_ROLE:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_USER_ROLE")


def _to_user_item(row) -> AdminUserItem:
    return AdminUserItem(
        id=str(row.id),
        email=row.email,
        role=row.role,  # type: ignore[arg-type]
        organization_id=str(row.organization_id),
        status=row.status,  # type: ignore[arg-type]
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _to_user_response(row) -> AdminUserResponse:
    return AdminUserResponse(
        id=str(row.id),
        email=row.email,
        role=row.role,  # type: ignore[arg-type]
        organization_id=str(row.organization_id),
        status=row.status,  # type: ignore[arg-type]
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _get_user_in_scope(db: Session, *, principal: AdminPrincipal, user_id: str):
    organization_id = require_institution_organization_id(principal)
    normalized_user_id = _validate_uuid_or_404(user_id, "USER_NOT_FOUND")
    row = get_user_by_id(db, user_id=normalized_user_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="USER_NOT_FOUND")
    if str(row.organization_id) != organization_id:
        create_audit_log(
            db,
            organization_id=organization_id,
            admin_id=principal.admin_id,
            action="admin.users.scope_blocked",
            target_type="user",
            target_id=str(row.id),
            result="blocked",
            request_id=None,
            metadata_json={"ownerOrganizationId": str(row.organization_id)},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ORGANIZATION_SCOPE_FORBIDDEN")
    return row


def list_admin_users_service(db: Session, *, principal: AdminPrincipal) -> AdminUsersListResponse:
    organization_id = require_institution_organization_id(principal)
    rows = list_users_by_organization(db, organization_id=organization_id)
    return AdminUsersListResponse(items=[_to_user_item(row) for row in rows])


def create_admin_user_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: AdminUserCreateRequest,
) -> AdminUserResponse:
    organization_id = require_institution_organization_id(principal)
    email = _normalize_email_or_422(body.email)
    _validate_role_or_422(body.role)
    _validate_status_or_422(body.status)

    if get_user_by_email(db, email=email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="USER_EMAIL_ALREADY_EXISTS")

    row = create_user(
        db,
        organization_id=organization_id,
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
        status=body.status,
    )
    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.users.create",
        target_type="user",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"email": row.email, "role": row.role, "status": row.status},
    )
    db.commit()
    db.refresh(row)
    return _to_user_response(row)


def update_admin_user_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    user_id: str,
    body: AdminUserUpdateRequest,
) -> AdminUserResponse:
    row = _get_user_in_scope(db, principal=principal, user_id=user_id)
    changed_fields: list[str] = []

    if body.email is not None:
        normalized_email = _normalize_email_or_422(body.email)
        if get_user_by_email(db, email=normalized_email, exclude_user_id=str(row.id)) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="USER_EMAIL_ALREADY_EXISTS")
        row.email = normalized_email
        changed_fields.append("email")
    if body.role is not None:
        _validate_role_or_422(body.role)
        row.role = body.role
        changed_fields.append("role")
    if body.status is not None:
        _validate_status_or_422(body.status)
        row.status = body.status
        changed_fields.append("status")

    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="admin.users.update",
        target_type="user",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"changedFields": changed_fields},
    )
    db.commit()
    db.refresh(row)
    return _to_user_response(row)


def delete_admin_user_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    user_id: str,
) -> Response:
    row = _get_user_in_scope(db, principal=principal, user_id=user_id)
    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="admin.users.delete",
        target_type="user",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"email": row.email},
    )
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
