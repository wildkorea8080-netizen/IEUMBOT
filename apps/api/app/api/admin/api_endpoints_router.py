"""
외부 API 연동 관리 API (Sprint 3-D).
"""

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.models.api_endpoint import ApiEndpoint
from app.schemas import ApiSchema
from app.services.admin.scope_service import (
    ensure_chatbot_in_scope,
    require_institution_organization_id,
)

router = APIRouter(tags=["admin-api-endpoints"])


# ── 스키마 ────────────────────────────────────────────────────────────────────

class ApiEndpointItem(ApiSchema):
    id: str
    chatbot_id: str
    name: str
    endpoint_url: str
    method: str
    headers: dict[str, str]
    params: dict[str, str]
    intent_keywords: list[str]
    response_type: str
    response_path: str | None
    response_template: str | None
    view_config: dict | None
    list_config: dict | None
    cache_seconds: int
    is_enabled: bool
    created_at: str


class ApiEndpointCreateRequest(ApiSchema):
    chatbot_id: str
    name: str
    endpoint_url: str
    method: Literal["GET", "POST"] = "GET"
    headers: dict[str, str] = {}
    params: dict[str, str] = {}
    intent_keywords: list[str]
    response_type: Literal["text", "view", "list"] = "text"
    response_path: str | None = None
    response_template: str | None = None
    view_config: dict | None = None
    list_config: dict | None = None
    cache_seconds: int = 60
    is_enabled: bool = True


class ApiEndpointUpdateRequest(ApiSchema):
    name: str | None = None
    endpoint_url: str | None = None
    method: Literal["GET", "POST"] | None = None
    headers: dict[str, str] | None = None
    params: dict[str, str] | None = None
    intent_keywords: list[str] | None = None
    response_type: Literal["text", "view", "list"] | None = None
    response_path: str | None = None
    response_template: str | None = None
    view_config: dict | None = None
    list_config: dict | None = None
    cache_seconds: int | None = None
    is_enabled: bool | None = None


class ApiEndpointListResponse(ApiSchema):
    items: list[ApiEndpointItem]
    total: int


class ApiTestResponse(ApiSchema):
    success: bool
    result_text: str | None
    error: str | None
    raw_preview: str | None


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _to_item(row: ApiEndpoint) -> ApiEndpointItem:
    return ApiEndpointItem(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        name=row.name,
        endpoint_url=row.endpoint_url,
        method=row.method,
        headers=dict(row.headers or {}),
        params=dict(row.params or {}),
        intent_keywords=list(row.intent_keywords or []),
        response_type=row.response_type or "text",
        response_path=row.response_path,
        response_template=row.response_template,
        view_config=dict(row.view_config) if row.view_config else None,
        list_config=dict(row.list_config) if row.list_config else None,
        cache_seconds=row.cache_seconds,
        is_enabled=row.is_enabled,
        created_at=row.created_at.isoformat(),
    )


def _get_row(db: Session, endpoint_id: str, organization_id: str) -> ApiEndpoint:
    row = db.execute(
        select(ApiEndpoint).where(
            ApiEndpoint.id == uuid.UUID(endpoint_id),
            ApiEndpoint.organization_id == uuid.UUID(organization_id),
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API_ENDPOINT_NOT_FOUND")
    return row


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@router.get("/api-endpoints", response_model=ApiEndpointListResponse)
def list_api_endpoints(
    chatbot_id: str | None = None,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> ApiEndpointListResponse:
    org_id = require_institution_organization_id(principal)
    conditions: list[Any] = [ApiEndpoint.organization_id == uuid.UUID(org_id)]
    if chatbot_id:
        try:
            conditions.append(ApiEndpoint.chatbot_id == uuid.UUID(chatbot_id))
        except ValueError:
            pass

    rows = db.execute(
        select(ApiEndpoint).where(*conditions).order_by(ApiEndpoint.created_at.asc())
    ).scalars().all()
    return ApiEndpointListResponse(items=[_to_item(r) for r in rows], total=len(rows))


@router.post("/api-endpoints", response_model=ApiEndpointItem, status_code=201)
def create_api_endpoint(
    body: ApiEndpointCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> ApiEndpointItem:
    org_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)

    row = ApiEndpoint(
        organization_id=uuid.UUID(org_id),
        chatbot_id=uuid.UUID(body.chatbot_id),
        name=body.name.strip(),
        endpoint_url=body.endpoint_url.strip(),
        method=body.method,
        headers=dict(body.headers),
        params=dict(body.params),
        intent_keywords=[k.strip() for k in body.intent_keywords if k.strip()],
        response_type=body.response_type,
        response_path=body.response_path,
        response_template=body.response_template,
        view_config=body.view_config,
        list_config=body.list_config,
        cache_seconds=max(0, body.cache_seconds),
        is_enabled=body.is_enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_item(row)


@router.patch("/api-endpoints/{endpoint_id}", response_model=ApiEndpointItem)
def update_api_endpoint(
    endpoint_id: str,
    body: ApiEndpointUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> ApiEndpointItem:
    org_id = require_institution_organization_id(principal)
    row = _get_row(db, endpoint_id, org_id)

    if body.name is not None:
        row.name = body.name.strip()
    if body.endpoint_url is not None:
        row.endpoint_url = body.endpoint_url.strip()
    if body.method is not None:
        row.method = body.method
    if body.headers is not None:
        row.headers = dict(body.headers)
    if body.params is not None:
        row.params = dict(body.params)
    if body.intent_keywords is not None:
        row.intent_keywords = [k.strip() for k in body.intent_keywords if k.strip()]
    if body.response_type is not None:
        row.response_type = body.response_type
    if body.response_path is not None:
        row.response_path = body.response_path
    if body.response_template is not None:
        row.response_template = body.response_template
    if body.view_config is not None:
        row.view_config = body.view_config
    if body.list_config is not None:
        row.list_config = body.list_config
    if body.cache_seconds is not None:
        row.cache_seconds = max(0, body.cache_seconds)
    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled

    db.commit()
    db.refresh(row)
    return _to_item(row)


@router.delete("/api-endpoints/{endpoint_id}", status_code=204)
def delete_api_endpoint(
    endpoint_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> None:
    org_id = require_institution_organization_id(principal)
    row = _get_row(db, endpoint_id, org_id)
    db.delete(row)
    db.commit()


@router.post("/api-endpoints/{endpoint_id}/test", response_model=ApiTestResponse)
def test_api_endpoint(
    endpoint_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> ApiTestResponse:
    """등록된 API 엔드포인트 즉시 테스트 호출."""
    org_id = require_institution_organization_id(principal)
    row = _get_row(db, endpoint_id, org_id)

    from app.services.chat.api_connector_service import call_api_endpoint  # noqa: PLC0415

    text, _structured = call_api_endpoint(row, question="테스트 질문")
    if text is not None:
        return ApiTestResponse(
            success=True,
            result_text=text[:500],
            error=None,
            raw_preview=text[:200],
        )
    return ApiTestResponse(
        success=False,
        result_text=None,
        error="API 호출 실패 또는 빈 응답. 서버 로그를 확인하세요.",
        raw_preview=None,
    )
