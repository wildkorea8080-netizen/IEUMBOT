import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import ChatbotSetting, Document, WebSource
from app.repositories.logs.audit_log_repository import create_audit_log


def require_institution_organization_id(principal: AdminPrincipal) -> str:
    if not principal.organization_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ORGANIZATION_SCOPE_REQUIRED")
    return principal.organization_id


def _blocked_scope(
    db: Session,
    *,
    principal: AdminPrincipal,
    target_type: str,
    target_id: str,
    owner_organization_id: str | None,
) -> None:
    organization_id = principal.organization_id or (owner_organization_id or "00000000-0000-0000-0000-000000000000")
    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="organization.scope.blocked",
        target_type=target_type,
        target_id=target_id,
        result="blocked",
        request_id=None,
        metadata_json={
            "principalOrganizationId": principal.organization_id,
            "ownerOrganizationId": owner_organization_id,
        },
    )
    db.commit()
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ORGANIZATION_SCOPE_FORBIDDEN")


def ensure_chatbot_in_scope(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> ChatbotSetting:
    require_institution_organization_id(principal)
    try:
        chatbot_uuid = uuid.UUID(chatbot_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND") from exc

    row = db.execute(select(ChatbotSetting).where(ChatbotSetting.id == chatbot_uuid)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    if str(row.organization_id) != str(principal.organization_id):
        _blocked_scope(
            db,
            principal=principal,
            target_type="chatbot",
            target_id=str(row.id),
            owner_organization_id=str(row.organization_id),
        )
    return row


def ensure_document_in_scope(
    db: Session,
    *,
    principal: AdminPrincipal,
    document_id: str,
) -> Document:
    require_institution_organization_id(principal)
    try:
        document_uuid = uuid.UUID(document_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DOCUMENT_NOT_FOUND") from exc

    row = db.execute(select(Document).where(Document.id == document_uuid)).scalar_one_or_none()
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DOCUMENT_NOT_FOUND")
    if str(row.organization_id) != str(principal.organization_id):
        _blocked_scope(
            db,
            principal=principal,
            target_type="document",
            target_id=str(row.id),
            owner_organization_id=str(row.organization_id),
        )
    return row


def ensure_web_source_in_scope(
    db: Session,
    *,
    principal: AdminPrincipal,
    web_source_id: str,
) -> WebSource:
    require_institution_organization_id(principal)
    try:
        web_source_uuid = uuid.UUID(web_source_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WEB_SOURCE_NOT_FOUND") from exc

    row = db.execute(select(WebSource).where(WebSource.id == web_source_uuid)).scalar_one_or_none()
    if row is None or row.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WEB_SOURCE_NOT_FOUND")
    if str(row.organization_id) != str(principal.organization_id):
        _blocked_scope(
            db,
            principal=principal,
            target_type="web_source",
            target_id=str(row.id),
            owner_organization_id=str(row.organization_id),
        )
    return row
