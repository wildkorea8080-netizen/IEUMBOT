"""탐색 메뉴(퀵액션) API — 관리자용 2단 메뉴 CRUD."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas import ApiSchema
from app.services.admin.quick_action_service import (
    MenuValidationError,
    create_menu_node,
    delete_menu_node,
    list_menu_tree,
    reorder_menu_nodes,
    update_menu_node,
)
from app.services.admin.scope_service import (
    ensure_chatbot_in_scope,
    require_institution_organization_id,
)

router = APIRouter(tags=["admin-quick-actions"])


class MenuNodeCreateRequest(ApiSchema):
    chatbot_id: str
    label: str
    action_type: str = "question"
    parent_id: str | None = None
    description: str | None = None
    payload: str | None = None
    url: str | None = None
    sort_order: int = 1


class MenuNodeUpdateRequest(ApiSchema):
    chatbot_id: str
    label: str | None = None
    description: str | None = None
    payload: str | None = None
    url: str | None = None
    sort_order: int | None = None
    is_enabled: bool | None = None


class MenuReorderRequest(ApiSchema):
    chatbot_id: str
    items: list[dict[str, Any]]


def _bad_request(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code, "message": message},
    )


@router.get("/quick-actions")
def admin_list_quick_actions(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[dict[str, Any]]:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    try:
        return list_menu_tree(db, chatbot_id=chatbot_id)
    except ValueError as exc:
        raise _bad_request("INVALID_ID", "잘못된 식별자입니다.") from exc


@router.post("/quick-actions", status_code=201)
def admin_create_quick_action(
    body: MenuNodeCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    try:
        return create_menu_node(
            db,
            organization_id=organization_id,
            chatbot_id=body.chatbot_id,
            label=body.label,
            action_type=body.action_type,
            parent_id=body.parent_id,
            description=body.description,
            payload=body.payload,
            url=body.url,
            sort_order=body.sort_order,
        )
    except MenuValidationError as exc:
        raise _bad_request(exc.code, exc.message) from exc
    except ValueError as exc:
        raise _bad_request("INVALID_ID", "잘못된 식별자입니다.") from exc


@router.patch("/quick-actions/{node_id}")
def admin_update_quick_action(
    node_id: str,
    body: MenuNodeUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    changes = body.model_dump(exclude={"chatbot_id"}, by_alias=True, exclude_none=True)
    try:
        return update_menu_node(db, node_id=node_id, chatbot_id=body.chatbot_id, changes=changes)
    except MenuValidationError as exc:
        raise _bad_request(exc.code, exc.message) from exc
    except ValueError as exc:
        raise _bad_request("INVALID_ID", "잘못된 식별자입니다.") from exc


@router.delete("/quick-actions/{node_id}", status_code=204)
def admin_delete_quick_action(
    node_id: str,
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> None:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    try:
        delete_menu_node(db, node_id=node_id, chatbot_id=chatbot_id)
    except MenuValidationError as exc:
        raise _bad_request(exc.code, exc.message) from exc
    except ValueError as exc:
        raise _bad_request("INVALID_ID", "잘못된 식별자입니다.") from exc


@router.post("/quick-actions/reorder")
def admin_reorder_quick_actions(
    body: MenuReorderRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict[str, int]:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    try:
        return {"updated": reorder_menu_nodes(db, chatbot_id=body.chatbot_id, items=body.items)}
    except MenuValidationError as exc:
        raise _bad_request(exc.code, exc.message) from exc
    except ValueError as exc:
        raise _bad_request("INVALID_ID", "잘못된 값입니다.") from exc
