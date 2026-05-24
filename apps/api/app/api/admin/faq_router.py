"""FAQ API — 관리자용 CRUD 엔드포인트."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas import ApiSchema
from app.services.admin.faq_service import (
    create_faq_item,
    delete_faq_item,
    get_faq_item,
    list_faq_items,
    update_faq_item,
)
from app.services.admin.scope_service import (
    ensure_chatbot_in_scope,
    require_institution_organization_id,
)

router = APIRouter(tags=["admin-faq"])


# ── 스키마 ─────────────────────────────────────────────────────────────────────

class FaqItemResponse(ApiSchema):
    id: str
    chatbot_id: str
    question: str
    answer: str
    tags: list[str]
    category: str | None
    field: str | None
    is_active: bool
    sort_order: int
    source_staging_session_id: str | None
    created_at: str
    updated_at: str


class FaqListResponse(ApiSchema):
    items: list[FaqItemResponse]
    total: int


class FaqCreateRequest(ApiSchema):
    chatbot_id: str
    question: str
    answer: str
    tags: list[str] = []
    category: str | None = None
    field: str | None = None


class FaqUpdateRequest(ApiSchema):
    question: str | None = None
    answer: str | None = None
    tags: list[str] | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    category: str | None = None
    field: str | None = None


def _to_response(row: Any) -> FaqItemResponse:
    return FaqItemResponse(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        question=row.question,
        answer=row.answer,
        tags=list(row.tags or []),
        category=row.category,
        field=row.field,
        is_active=row.is_active,
        sort_order=row.sort_order,
        source_staging_session_id=row.source_staging_session_id,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


# ── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.get("/faq", response_model=FaqListResponse)
def list_faq(
    chatbot_id: str,
    include_inactive: bool = False,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> FaqListResponse:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    org_id = require_institution_organization_id(principal)
    rows = list_faq_items(
        db,
        chatbot_id=chatbot_id,
        organization_id=org_id,
        include_inactive=include_inactive,
    )
    return FaqListResponse(items=[_to_response(r) for r in rows], total=len(rows))


@router.post("/faq", response_model=FaqItemResponse, status_code=201)
def create_faq(
    body: FaqCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> FaqItemResponse:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    org_id = require_institution_organization_id(principal)
    row = create_faq_item(
        db,
        chatbot_id=body.chatbot_id,
        organization_id=org_id,
        question=body.question,
        answer=body.answer,
        tags=body.tags,
        category=body.category,
        field=body.field,
    )
    return _to_response(row)


@router.patch("/faq/{faq_id}", response_model=FaqItemResponse)
def update_faq(
    faq_id: str,
    body: FaqUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> FaqItemResponse:
    org_id = require_institution_organization_id(principal)
    row = update_faq_item(
        db,
        faq_id=faq_id,
        organization_id=org_id,
        question=body.question,
        answer=body.answer,
        tags=body.tags,
        is_active=body.is_active,
        sort_order=body.sort_order,
        category=body.category,
        field=body.field,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ_NOT_FOUND")
    return _to_response(row)


@router.delete("/faq/{faq_id}", status_code=204)
def delete_faq(
    faq_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> None:
    org_id = require_institution_organization_id(principal)
    deleted = delete_faq_item(db, faq_id=faq_id, organization_id=org_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ_NOT_FOUND")
