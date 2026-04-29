import uuid
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.repositories.logs.audit_log_repository import create_audit_log
from app.repositories.super_admin.admins_contracts_repository import get_organization_by_id
from app.repositories.super_admin.chatbots_widgets_repository import (
    count_documents_by_chatbot,
    count_web_sources_by_chatbot,
    count_widgets_by_chatbot,
    create_chatbot,
    create_widget_deployment,
    get_chatbot_by_id,
    get_chatbot_by_org_name,
    get_last_trained_at_by_chatbot,
    get_widget_by_id,
    list_all_chatbots_with_organizations,
    list_chatbots_by_organization,
    list_widgets,
    list_widgets_by_organization,
)
from app.schemas.super_admin_chatbots_widgets import (
    SuperAdminChatbotCreateRequest,
    SuperAdminChatbotDetailResponse,
    SuperAdminChatbotListItem,
    SuperAdminChatbotListResponse,
    SuperAdminChatbotSettingsSummary,
    SuperAdminChatbotUpdateRequest,
    SuperAdminWidgetCreateRequest,
    SuperAdminWidgetCreateResponse,
    SuperAdminWidgetDetailResponse,
    SuperAdminWidgetDomainsUpdateRequest,
    SuperAdminWidgetListItem,
    SuperAdminWidgetListResponse,
)
from app.services.limits_service import check_chatbot_limit, check_widget_limit
from app.services.widget_install_script import build_widget_install_script


def _validate_uuid_or_404(entity_id: str, detail: str) -> str:
    try:
        return str(uuid.UUID(entity_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _normalize_domain(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ALLOWED_DOMAIN")
    parsed = urlparse(normalized if "://" in normalized else f"https://{normalized}")
    host = parsed.netloc or parsed.path
    host = host.strip().lower().rstrip("/")
    if ":" in host:
        host = host.split(":", 1)[0].strip()
    if not host or " " in host:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_ALLOWED_DOMAIN")
    return host


def _to_chatbot_list_item(db: Session, *, row, organization_name: str) -> SuperAdminChatbotListItem:
    last_trained_at = get_last_trained_at_by_chatbot(db, chatbot_id=str(row.id))
    return SuperAdminChatbotListItem(
        id=str(row.id),
        name=row.name,
        status=row.status,
        organization_id=str(row.organization_id),
        organization_name=organization_name,
        document_count=count_documents_by_chatbot(db, chatbot_id=str(row.id)),
        website_count=count_web_sources_by_chatbot(db, chatbot_id=str(row.id)),
        last_trained_at=(last_trained_at.isoformat() if last_trained_at else None),
        created_at=row.created_at.isoformat(),
    )


def _to_chatbot_detail_response(db: Session, *, row) -> SuperAdminChatbotDetailResponse:
    settings_json = row.answer_settings_json or {}
    settings_summary = SuperAdminChatbotSettingsSummary(
        answer_template_mode=settings_json.get("answerTemplateMode"),
        citation_display_mode=settings_json.get("citationDisplayMode"),
        disallow_answer_without_evidence=settings_json.get("disallowAnswerWithoutEvidence"),
        require_citations=settings_json.get("requireCitations"),
        model_name=settings_json.get("modelName"),
    )
    return SuperAdminChatbotDetailResponse(
        id=str(row.id),
        name=row.name,
        status=row.status,
        organization_id=str(row.organization_id),
        settings=settings_summary,
        document_count=count_documents_by_chatbot(db, chatbot_id=str(row.id)),
        website_count=count_web_sources_by_chatbot(db, chatbot_id=str(row.id)),
        widget_count=count_widgets_by_chatbot(db, chatbot_id=str(row.id)),
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _to_widget_list_item(row) -> SuperAdminWidgetListItem:
    domains = row.allowed_domains or []
    primary_domain = domains[0] if domains else None
    return SuperAdminWidgetListItem(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        organization_id=str(row.organization_id),
        allowed_domains=list(domains),
        status=row.status,
        domain=primary_domain,
        is_active=(row.status == "active"),
        install_script=build_widget_install_script(chatbot_id=str(row.chatbot_id)),
        created_at=row.created_at.isoformat(),
    )


def _to_widget_detail_response(row) -> SuperAdminWidgetDetailResponse:
    return SuperAdminWidgetDetailResponse(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        organization_id=str(row.organization_id),
        allowed_domains=list(row.allowed_domains or []),
        is_active=(row.status == "active"),
        install_script=build_widget_install_script(chatbot_id=str(row.chatbot_id)),
        last_used_at=None,
        created_at=row.created_at.isoformat(),
    )


def list_chatbots_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
) -> SuperAdminChatbotListResponse:
    _ = principal
    organization_id = _validate_uuid_or_404(organization_id, "ORGANIZATION_NOT_FOUND")
    organization = get_organization_by_id(db, organization_id=organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    rows = list_chatbots_by_organization(db, organization_id=organization_id)
    return SuperAdminChatbotListResponse(
        items=[_to_chatbot_list_item(db, row=row, organization_name=organization.name) for row in rows]
    )


def list_all_chatbots_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> SuperAdminChatbotListResponse:
    _ = principal
    rows = list_all_chatbots_with_organizations(db)
    return SuperAdminChatbotListResponse(
        items=[
            _to_chatbot_list_item(db, row=chatbot, organization_name=organization_name)
            for chatbot, organization_name in rows
        ]
    )


def create_chatbot_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: SuperAdminChatbotCreateRequest,
) -> SuperAdminChatbotDetailResponse:
    organization_id = _validate_uuid_or_404(body.organization_id, "ORGANIZATION_NOT_FOUND")
    organization = get_organization_by_id(db, organization_id=organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    chatbot_name = body.name.strip()
    if not chatbot_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CHATBOT_NAME_REQUIRED")

    if body.status not in {"active", "inactive", "suspended"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_CHATBOT_STATUS")

    duplicated = get_chatbot_by_org_name(db, organization_id=organization_id, name=chatbot_name)
    if duplicated is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="CHATBOT_NAME_CONFLICT")

    check_chatbot_limit(db, organization_id=organization_id, admin_id=principal.admin_id)

    row = create_chatbot(
        db,
        organization_id=organization_id,
        name=chatbot_name,
        status=body.status,
    )

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="super_admin.chatbot.create",
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
    return _to_chatbot_detail_response(db, row=row)


def get_chatbot_detail_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> SuperAdminChatbotDetailResponse:
    _ = principal
    chatbot_id = _validate_uuid_or_404(chatbot_id, "CHATBOT_NOT_FOUND")
    row = get_chatbot_by_id(db, chatbot_id=chatbot_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    return _to_chatbot_detail_response(db, row=row)


def activate_chatbot_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> SuperAdminChatbotDetailResponse:
    chatbot_id = _validate_uuid_or_404(chatbot_id, "CHATBOT_NOT_FOUND")
    row = get_chatbot_by_id(db, chatbot_id=chatbot_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    row.status = "active"
    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.chatbot.activate",
        target_type="chatbot",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"status": "active"},
    )
    db.commit()
    db.refresh(row)
    return _to_chatbot_detail_response(db, row=row)


def suspend_chatbot_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> SuperAdminChatbotDetailResponse:
    chatbot_id = _validate_uuid_or_404(chatbot_id, "CHATBOT_NOT_FOUND")
    row = get_chatbot_by_id(db, chatbot_id=chatbot_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    row.status = "suspended"
    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.chatbot.suspend",
        target_type="chatbot",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"status": "suspended"},
    )
    db.commit()
    db.refresh(row)
    return _to_chatbot_detail_response(db, row=row)


def update_chatbot_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: SuperAdminChatbotUpdateRequest,
) -> SuperAdminChatbotDetailResponse:
    chatbot_id = _validate_uuid_or_404(chatbot_id, "CHATBOT_NOT_FOUND")
    row = get_chatbot_by_id(db, chatbot_id=chatbot_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    next_organization_id = str(row.organization_id)
    if body.organization_id is not None:
        next_organization_id = _validate_uuid_or_404(body.organization_id, "ORGANIZATION_NOT_FOUND")
        organization = get_organization_by_id(db, organization_id=next_organization_id)
        if organization is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    next_name = row.name
    if body.name is not None:
        normalized_name = body.name.strip()
        if not normalized_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CHATBOT_NAME_REQUIRED")
        next_name = normalized_name

    if body.status is not None and body.status not in {"active", "inactive", "suspended"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_CHATBOT_STATUS")

    duplicated = get_chatbot_by_org_name(db, organization_id=next_organization_id, name=next_name)
    if duplicated is not None and str(duplicated.id) != str(row.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="CHATBOT_NAME_CONFLICT")

    row.organization_id = next_organization_id
    row.name = next_name
    if body.status is not None:
        row.status = body.status

    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.chatbot.update",
        target_type="chatbot",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "organizationId": str(row.organization_id),
            "name": row.name,
            "status": row.status,
        },
    )
    db.commit()
    db.refresh(row)
    return _to_chatbot_detail_response(db, row=row)


def list_widgets_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    organization_id: str,
) -> SuperAdminWidgetListResponse:
    _ = principal
    organization_id = _validate_uuid_or_404(organization_id, "ORGANIZATION_NOT_FOUND")
    organization = get_organization_by_id(db, organization_id=organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ORGANIZATION_NOT_FOUND")

    rows = list_widgets_by_organization(db, organization_id=organization_id)
    return SuperAdminWidgetListResponse(items=[_to_widget_list_item(row) for row in rows])


def list_all_widgets_service(
    db: Session,
    *,
    principal: AdminPrincipal,
) -> SuperAdminWidgetListResponse:
    _ = principal
    rows = list_widgets(db)
    return SuperAdminWidgetListResponse(items=[_to_widget_list_item(row) for row in rows])


def create_widget_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: SuperAdminWidgetCreateRequest,
) -> SuperAdminWidgetCreateResponse:
    chatbot_id = _validate_uuid_or_404(body.chatbot_id, "CHATBOT_NOT_FOUND")
    chatbot = get_chatbot_by_id(db, chatbot_id=chatbot_id)
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    check_widget_limit(db, organization_id=str(chatbot.organization_id), admin_id=principal.admin_id)

    if not body.allowed_domains:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ALLOWED_DOMAINS_REQUIRED")

    normalized_domains = []
    seen: set[str] = set()
    for raw_domain in body.allowed_domains:
        domain = _normalize_domain(raw_domain)
        if domain in seen:
            continue
        seen.add(domain)
        normalized_domains.append(domain)

    if not normalized_domains:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ALLOWED_DOMAINS_REQUIRED")

    install_script = build_widget_install_script(chatbot_id=str(chatbot.id))
    row = create_widget_deployment(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        allowed_domains=normalized_domains,
        status="active",
        install_script=install_script,
    )

    create_audit_log(
        db,
        organization_id=str(chatbot.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.widget.create",
        target_type="widget",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "chatbotId": str(chatbot.id),
            "allowedDomains": normalized_domains,
        },
    )
    db.commit()
    db.refresh(row)

    return SuperAdminWidgetCreateResponse(
        widget_id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        organization_id=str(row.organization_id),
        allowed_domains=list(row.allowed_domains or []),
        status=row.status,
        is_active=(row.status == "active"),
        install_script=install_script,
        created_at=row.created_at.isoformat(),
    )


def get_widget_detail_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    widget_id: str,
) -> SuperAdminWidgetDetailResponse:
    _ = principal
    widget_id = _validate_uuid_or_404(widget_id, "WIDGET_NOT_FOUND")
    row = get_widget_by_id(db, widget_id=widget_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WIDGET_NOT_FOUND")
    return _to_widget_detail_response(row)


def activate_widget_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    widget_id: str,
) -> SuperAdminWidgetDetailResponse:
    widget_id = _validate_uuid_or_404(widget_id, "WIDGET_NOT_FOUND")
    row = get_widget_by_id(db, widget_id=widget_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WIDGET_NOT_FOUND")

    row.status = "active"
    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.widget.activate",
        target_type="widget",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"status": "active"},
    )
    db.commit()
    db.refresh(row)
    return _to_widget_detail_response(row)


def deactivate_widget_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    widget_id: str,
) -> SuperAdminWidgetDetailResponse:
    widget_id = _validate_uuid_or_404(widget_id, "WIDGET_NOT_FOUND")
    row = get_widget_by_id(db, widget_id=widget_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WIDGET_NOT_FOUND")

    row.status = "inactive"
    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.widget.deactivate",
        target_type="widget",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"status": "inactive"},
    )
    db.commit()
    db.refresh(row)
    return _to_widget_detail_response(row)


def update_widget_domains_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    widget_id: str,
    body: SuperAdminWidgetDomainsUpdateRequest,
) -> SuperAdminWidgetDetailResponse:
    widget_id = _validate_uuid_or_404(widget_id, "WIDGET_NOT_FOUND")
    row = get_widget_by_id(db, widget_id=widget_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WIDGET_NOT_FOUND")

    if not body.allowed_domains:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ALLOWED_DOMAINS_REQUIRED")

    normalized_domains = []
    seen: set[str] = set()
    for raw_domain in body.allowed_domains:
        domain = _normalize_domain(raw_domain)
        if domain in seen:
            continue
        seen.add(domain)
        normalized_domains.append(domain)

    if not normalized_domains:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ALLOWED_DOMAINS_REQUIRED")

    row.allowed_domains = normalized_domains
    create_audit_log(
        db,
        organization_id=str(row.organization_id),
        admin_id=principal.admin_id,
        action="super_admin.widget.update_domains",
        target_type="widget",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={"allowedDomains": normalized_domains},
    )
    db.commit()
    db.refresh(row)
    return _to_widget_detail_response(row)
