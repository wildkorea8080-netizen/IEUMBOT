import re
import secrets
import string
import uuid
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.core.security import hash_password
from app.repositories.logs.audit_log_repository import create_audit_log
from app.repositories.super_admin.admins_contracts_repository import create_admin, get_admin_by_email
from app.repositories.super_admin.organizations_repository import (
    count_admins_by_organization,
    count_chat_messages_last_30_days,
    count_chatbots_by_organization,
    count_widgets_by_organization,
    create_organization,
    get_latest_contract_summary,
    get_organization_by_id,
    get_organization_by_primary_domain,
    get_organization_by_slug,
    list_organizations,
)
from app.schemas.super_admin_organizations import (
    OrganizationContractSummary,
    OrganizationUsageSummary,
    SuperAdminOrganizationCreateRequest,
    SuperAdminOrganizationCreateResponse,
    SuperAdminOrganizationDetailResponse,
    SuperAdminOrganizationListItem,
    SuperAdminOrganizationListResponse,
    SuperAdminOrganizationUpdateRequest,
)

ORGANIZATION_STATUS_SET = {"active", "suspended", "trial"}
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ORGANIZATION_CODE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,119}$")
TEMP_PASSWORD_ALPHABET = string.ascii_letters + string.digits + "!@#$%^&*"
INSTITUTION_ADMIN_ROLES = {"institution_admin", "admin"}
SUPER_ADMIN_ROLE = "super_admin"


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _normalize_primary_domain(value: str | None) -> str | None:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        return None

    parsed = urlparse(normalized if "://" in normalized else f"https://{normalized}")
    host = parsed.netloc or parsed.path
    host = host.strip().lower().rstrip("/")
    if ":" in host:
        host = host.split(":", 1)[0].strip()
    if not host:
        return None
    if " " in host:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_PRIMARY_DOMAIN")
    return host


def _slugify_name(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    base = base.strip("-")
    return base or "organization"


def _normalize_organization_code(value: str) -> str:
    normalized = value.strip().lower()
    if not ORGANIZATION_CODE_PATTERN.match(normalized):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ORGANIZATION_CODE")
    return normalized


def _normalize_contact_email(value: str | None) -> str | None:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        return None
    lowered = normalized.lower()
    if not EMAIL_PATTERN.match(lowered):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_CONTACT_EMAIL")
    return lowered


def _normalize_admin_email(value: str) -> str:
    normalized = value.strip().lower()
    if not EMAIL_PATTERN.match(normalized):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ADMIN_EMAIL")
    return normalized


def _build_unique_slug(db: Session, *, name: str) -> str:
    base_slug = _slugify_name(name)
    candidate = base_slug
    seq = 2
    while get_organization_by_slug(db, slug=candidate) is not None:
        candidate = f"{base_slug}-{seq}"
        seq += 1
    return candidate


def _generate_temp_password(length: int = 14) -> str:
    while True:
        password = "".join(secrets.choice(TEMP_PASSWORD_ALPHABET) for _ in range(length))
        if (
            any(char.islower() for char in password)
            and any(char.isupper() for char in password)
            and any(char.isdigit() for char in password)
            and any(not char.isalnum() for char in password)
        ):
            return password


def _validate_status(status_value: str) -> None:
    if status_value not in ORGANIZATION_STATUS_SET:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ORGANIZATION_STATUS")


def _validate_organization_id(organization_id: str) -> str:
    try:
        return str(uuid.UUID(organization_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND") from exc


def _upsert_existing_organization(
    *,
    row,
    name: str,
    status_value: str,
    primary_domain: str | None,
    contact_name: str | None,
    contact_email: str | None,
    contact_phone: str | None,
) -> None:
    row.name = name
    row.status = status_value
    row.primary_domain = primary_domain
    row.contact_name = contact_name
    row.contact_email = contact_email
    row.contact_phone = contact_phone


def _attach_or_update_institution_admin(
    *,
    admin_row,
    organization_id: str,
    admin_name: str,
):
    admin_row.organization_id = organization_id
    admin_row.name = admin_name
    admin_row.role = "institution_admin"
    admin_row.status = "active"
    return admin_row


def list_organizations_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    query: str | None,
    status_value: str | None,
    page: int,
    page_size: int,
) -> SuperAdminOrganizationListResponse:
    _ = principal
    if status_value:
        _validate_status(status_value)

    rows, total = list_organizations(
        db,
        query=_normalize_optional_text(query),
        status=status_value,
        page=page,
        page_size=page_size,
    )
    items = [
        SuperAdminOrganizationListItem(
            id=str(org.id),
            name=org.name,
            code=org.slug,
            status=org.status,  # type: ignore[arg-type]
            primary_domain=org.primary_domain,
            contact_name=org.contact_name,
            contact_email=org.contact_email,
            contact_phone=org.contact_phone,
            chatbot_count=int(chatbot_count or 0),
            contract_status=contract_status,
            created_at=org.created_at.isoformat(),
        )
        for org, chatbot_count, contract_status in rows
    ]
    return SuperAdminOrganizationListResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


def create_organization_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: SuperAdminOrganizationCreateRequest,
) -> SuperAdminOrganizationCreateResponse:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ORGANIZATION_NAME")
    code = _normalize_organization_code(body.code)
    admin_email = _normalize_admin_email(body.admin_email)
    admin_name = _normalize_optional_text(body.admin_name)
    if admin_name is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ADMIN_NAME")
    primary_domain = _normalize_primary_domain(body.primary_domain)
    contact_name = _normalize_optional_text(body.contact_name)
    contact_email = _normalize_contact_email(body.contact_email)
    contact_phone = _normalize_optional_text(body.contact_phone)
    status_value = body.status
    _validate_status(status_value)

    existing_org = get_organization_by_slug(db, slug=code)
    if primary_domain:
        exists = get_organization_by_primary_domain(db, primary_domain=primary_domain)
        if exists is not None and (existing_org is None or str(exists.id) != str(existing_org.id)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="PRIMARY_DOMAIN_ALREADY_EXISTS")
    existing_admin = get_admin_by_email(db, email=admin_email)

    if existing_admin is not None and str(existing_admin.role) == SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="SUPER_ADMIN_EMAIL_REUSE_FORBIDDEN")

    if existing_org is not None:
        if existing_admin is None or str(existing_admin.organization_id) != str(existing_org.id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ORGANIZATION_CODE_ALREADY_EXISTS")
        if str(existing_admin.role) not in INSTITUTION_ADMIN_ROLES:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ADMIN_EMAIL_ALREADY_EXISTS")

        _upsert_existing_organization(
            row=existing_org,
            name=name,
            status_value=status_value,
            primary_domain=primary_domain,
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
        )
        admin_row = _attach_or_update_institution_admin(
            admin_row=existing_admin,
            organization_id=str(existing_org.id),
            admin_name=admin_name,
        )
        row = existing_org
        temp_password: str | None = None
        must_change_password = bool(admin_row.must_change_password)
    else:
        row = create_organization(
            db,
            name=name,
            slug=code,
            status=status_value,
            primary_domain=primary_domain,
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
        )

        if existing_admin is None:
            temp_password = _generate_temp_password()
            admin_row = create_admin(
                db,
                organization_id=str(row.id),
                email=admin_email,
                name=admin_name,
                role="institution_admin",
                status="active",
                password_hash=hash_password(temp_password),
                must_change_password=True,
            )
            must_change_password = True
        else:
            if str(existing_admin.role) not in INSTITUTION_ADMIN_ROLES:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ADMIN_EMAIL_ALREADY_EXISTS")
            if existing_admin.organization_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="ADMIN_EMAIL_ALREADY_ASSIGNED_TO_OTHER_ORGANIZATION",
                )
            admin_row = _attach_or_update_institution_admin(
                admin_row=existing_admin,
                organization_id=str(row.id),
                admin_name=admin_name,
            )
            temp_password = None
            must_change_password = bool(admin_row.must_change_password)

    create_audit_log(
        db,
        organization_id=str(row.id),
        admin_id=principal.admin_id,
        action="super_admin.organizations.create",
        target_type="organization",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "name": row.name,
            "code": row.slug,
            "status": row.status,
            "primaryDomain": row.primary_domain,
            "adminEmail": admin_row.email,
            "adminLinked": temp_password is None,
        },
    )
    db.commit()
    db.refresh(row)
    detail = get_organization_detail_service(db, principal=principal, organization_id=str(row.id))
    return SuperAdminOrganizationCreateResponse(
        **detail.model_dump(),
        admin_email=admin_row.email,
        temp_password=temp_password,
        must_change_password=must_change_password,
    )


def get_organization_detail_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
) -> SuperAdminOrganizationDetailResponse:
    _ = principal
    organization_id = _validate_organization_id(organization_id)
    row = get_organization_by_id(db, organization_id=organization_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    contract = get_latest_contract_summary(db, organization_id=organization_id)
    admin_count = count_admins_by_organization(db, organization_id=organization_id)
    chatbot_count = count_chatbots_by_organization(db, organization_id=organization_id)
    widget_count = count_widgets_by_organization(db, organization_id=organization_id)
    last_30_days_conversation_count = count_chat_messages_last_30_days(db, organization_id=organization_id)

    return SuperAdminOrganizationDetailResponse(
        id=str(row.id),
        name=row.name,
        code=row.slug,
        status=row.status,  # type: ignore[arg-type]
        primary_domain=row.primary_domain,
        contact_name=row.contact_name,
        contact_email=row.contact_email,
        contact_phone=row.contact_phone,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
        contract_summary=OrganizationContractSummary(
            status=(contract.status if contract else None),
            plan_name=(contract.plan_name if contract else None),
            start_date=(contract.start_date if contract else None),
            end_date=(contract.end_date if contract else None),
        ),
        admin_count=admin_count,
        chatbot_count=chatbot_count,
        widget_count=widget_count,
        recent_usage_summary=OrganizationUsageSummary(
            monthly_conversation_count=last_30_days_conversation_count,
            last_30_days_conversation_count=last_30_days_conversation_count,
        ),
    )


def update_organization_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
    body: SuperAdminOrganizationUpdateRequest,
) -> SuperAdminOrganizationDetailResponse:
    organization_id = _validate_organization_id(organization_id)
    row = get_organization_by_id(db, organization_id=organization_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    changed_fields: list[str] = []

    if body.name is not None:
        normalized_name = body.name.strip()
        if not normalized_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ORGANIZATION_NAME")
        row.name = normalized_name
        changed_fields.append("name")
    if body.primary_domain is not None:
        normalized_domain = _normalize_primary_domain(body.primary_domain)
        if normalized_domain:
            exists = get_organization_by_primary_domain(
                db,
                primary_domain=normalized_domain,
                exclude_organization_id=organization_id,
            )
            if exists is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="PRIMARY_DOMAIN_ALREADY_EXISTS")
        row.primary_domain = normalized_domain
        changed_fields.append("primary_domain")
    if body.contact_name is not None:
        row.contact_name = _normalize_optional_text(body.contact_name)
        changed_fields.append("contact_name")
    if body.contact_email is not None:
        row.contact_email = _normalize_contact_email(body.contact_email)
        changed_fields.append("contact_email")
    if body.contact_phone is not None:
        row.contact_phone = _normalize_optional_text(body.contact_phone)
        changed_fields.append("contact_phone")
    if body.status is not None:
        _validate_status(body.status)
        row.status = body.status
        changed_fields.append("status")

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="super_admin.organizations.update",
        target_type="organization",
        target_id=organization_id,
        result="success",
        request_id=None,
        metadata_json={"changedFields": changed_fields},
    )
    db.commit()
    db.refresh(row)
    return get_organization_detail_service(db, principal=principal, organization_id=organization_id)


def activate_organization_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
) -> SuperAdminOrganizationDetailResponse:
    organization_id = _validate_organization_id(organization_id)
    row = get_organization_by_id(db, organization_id=organization_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    row.status = "active"
    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="super_admin.organizations.activate",
        target_type="organization",
        target_id=organization_id,
        result="success",
        request_id=None,
        metadata_json={"status": "active"},
    )
    db.commit()
    db.refresh(row)
    return get_organization_detail_service(db, principal=principal, organization_id=organization_id)


def suspend_organization_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
) -> SuperAdminOrganizationDetailResponse:
    organization_id = _validate_organization_id(organization_id)
    row = get_organization_by_id(db, organization_id=organization_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    row.status = "suspended"
    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="super_admin.organizations.suspend",
        target_type="organization",
        target_id=organization_id,
        result="success",
        request_id=None,
        metadata_json={"status": "suspended"},
    )
    db.commit()
    db.refresh(row)
    return get_organization_detail_service(db, principal=principal, organization_id=organization_id)
