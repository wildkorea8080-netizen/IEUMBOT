import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.models.conditional_response import ConditionalResponse
from app.schemas import ApiSchema
from app.services.admin.scope_service import (
    ensure_chatbot_in_scope,
    require_institution_organization_id,
)

router = APIRouter(tags=["admin-conditional"])


# ── 스키마 ────────────────────────────────────────────────────────────────────

class ConditionalResponseItem(ApiSchema):
    id: str
    chatbot_id: str
    name: str
    trigger_keywords: list[str]
    trigger_type: str
    action_type: str
    action_label: str
    action_value: str
    action_description: str | None
    is_enabled: bool
    priority: int
    created_at: str


class ConditionalResponseCreateRequest(ApiSchema):
    chatbot_id: str
    name: str
    trigger_keywords: list[str]
    trigger_type: Literal["question", "answer", "both"] = "both"
    action_type: Literal["link", "video", "file", "contact"]
    action_label: str
    action_value: str
    action_description: str | None = None
    is_enabled: bool = True
    priority: int = 0


class ConditionalResponseUpdateRequest(ApiSchema):
    name: str | None = None
    trigger_keywords: list[str] | None = None
    trigger_type: Literal["question", "answer", "both"] | None = None
    action_type: Literal["link", "video", "file", "contact"] | None = None
    action_label: str | None = None
    action_value: str | None = None
    action_description: str | None = None
    is_enabled: bool | None = None
    priority: int | None = None


class ConditionalResponseListResponse(ApiSchema):
    items: list[ConditionalResponseItem]
    total: int


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _to_item(row: ConditionalResponse) -> ConditionalResponseItem:
    return ConditionalResponseItem(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        name=row.name,
        trigger_keywords=list(row.trigger_keywords or []),
        trigger_type=row.trigger_type,
        action_type=row.action_type,
        action_label=row.action_label,
        action_value=row.action_value,
        action_description=row.action_description,
        is_enabled=row.is_enabled,
        priority=row.priority,
        created_at=row.created_at.isoformat(),
    )


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@router.get("/conditional", response_model=ConditionalResponseListResponse)
def list_conditional(
    chatbot_id: str | None = Query(default=None, alias="chatbotId"),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> ConditionalResponseListResponse:
    organization_id = require_institution_organization_id(principal)
    conditions: list[Any] = [ConditionalResponse.organization_id == uuid.UUID(organization_id)]
    if chatbot_id:
        try:
            conditions.append(ConditionalResponse.chatbot_id == uuid.UUID(chatbot_id))
        except ValueError:
            pass

    rows = db.execute(
        select(ConditionalResponse)
        .where(*conditions)
        .order_by(ConditionalResponse.priority.asc(), ConditionalResponse.created_at.asc())
    ).scalars().all()

    return ConditionalResponseListResponse(items=[_to_item(r) for r in rows], total=len(rows))


@router.post("/conditional", response_model=ConditionalResponseItem, status_code=201)
def create_conditional(
    body: ConditionalResponseCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> ConditionalResponseItem:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)

    row = ConditionalResponse(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=uuid.UUID(body.chatbot_id),
        name=body.name.strip(),
        trigger_keywords=[k.strip() for k in body.trigger_keywords if k.strip()],
        trigger_type=body.trigger_type,
        action_type=body.action_type,
        action_label=body.action_label.strip(),
        action_value=body.action_value.strip(),
        action_description=body.action_description,
        is_enabled=body.is_enabled,
        priority=body.priority,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_item(row)


@router.patch("/conditional/{rule_id}", response_model=ConditionalResponseItem)
def update_conditional(
    rule_id: str,
    body: ConditionalResponseUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> ConditionalResponseItem:
    organization_id = require_institution_organization_id(principal)
    row = db.execute(
        select(ConditionalResponse).where(
            ConditionalResponse.id == uuid.UUID(rule_id),
            ConditionalResponse.organization_id == uuid.UUID(organization_id),
        )
    ).scalar_one_or_none()

    if row is None:
        from fastapi import HTTPException, status  # noqa: PLC0415
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CONDITIONAL_NOT_FOUND")

    if body.name is not None:
        row.name = body.name.strip()
    if body.trigger_keywords is not None:
        row.trigger_keywords = [k.strip() for k in body.trigger_keywords if k.strip()]
    if body.trigger_type is not None:
        row.trigger_type = body.trigger_type
    if body.action_type is not None:
        row.action_type = body.action_type
    if body.action_label is not None:
        row.action_label = body.action_label.strip()
    if body.action_value is not None:
        row.action_value = body.action_value.strip()
    if body.action_description is not None:
        row.action_description = body.action_description
    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled
    if body.priority is not None:
        row.priority = body.priority

    db.commit()
    db.refresh(row)
    return _to_item(row)


@router.delete("/conditional/{rule_id}", status_code=204)
def delete_conditional(
    rule_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> None:
    organization_id = require_institution_organization_id(principal)
    row = db.execute(
        select(ConditionalResponse).where(
            ConditionalResponse.id == uuid.UUID(rule_id),
            ConditionalResponse.organization_id == uuid.UUID(organization_id),
        )
    ).scalar_one_or_none()

    if row is None:
        from fastapi import HTTPException, status  # noqa: PLC0415
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CONDITIONAL_NOT_FOUND")

    db.delete(row)
    db.commit()
