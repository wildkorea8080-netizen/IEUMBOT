"""탐색 메뉴(퀵액션) 서비스 — 2단 트리 검증·조회·변경."""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import QuickAction
from app.repositories.admin.quick_action_repository import (
    get_node,
    insert_node,
    list_nodes,
    soft_delete_with_children,
)

ACTION_TYPES = frozenset({"category", "question", "link"})


class MenuValidationError(Exception):
    """관리자 입력이 메뉴 규칙에 어긋날 때. code는 API 에러 코드로 그대로 노출된다."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def validate_node_shape(*, action_type: str, parent_is_child: bool, has_parent: bool) -> None:
    """노드 하나의 모양이 2단 규칙에 맞는지 검사.

    parent_is_child: 부모로 지정한 노드가 이미 다른 노드의 자식인가
                     (True면 이 노드는 3단이 되므로 거부)
    """
    if action_type not in ACTION_TYPES:
        raise MenuValidationError("INVALID_ACTION_TYPE", f"허용되지 않는 유형입니다: {action_type}")
    if action_type == "category" and has_parent:
        raise MenuValidationError(
            "CATEGORY_CANNOT_HAVE_PARENT", "대분류는 다른 항목의 하위로 둘 수 없습니다."
        )
    if has_parent and parent_is_child:
        raise MenuValidationError("MENU_DEPTH_EXCEEDED", "메뉴는 2단까지만 만들 수 있습니다.")


def _to_dict(node: Any) -> dict[str, Any]:
    return {
        "id": str(node.id),
        "label": node.label,
        "description": node.description,
        "actionType": node.action_type,
        "payload": node.payload,
        "url": node.url,
        "sortOrder": node.sort_order,
        "isEnabled": node.is_enabled,
        "children": [],
    }


def build_menu_tree(nodes: list[Any]) -> list[dict[str, Any]]:
    """평면 노드 목록 → 2단 트리. 부모가 없는 자식은 버린다."""
    by_id: dict[str, dict[str, Any]] = {}
    roots: list[dict[str, Any]] = []
    for node in nodes:
        if node.parent_id is None:
            item = _to_dict(node)
            by_id[str(node.id)] = item
            roots.append(item)
    for node in nodes:
        if node.parent_id is None:
            continue
        parent = by_id.get(str(node.parent_id))
        if parent is None:
            continue  # 고아 노드
        parent["children"].append(_to_dict(node))
    return roots


def list_menu_tree(db: Session, *, chatbot_id: str) -> list[dict[str, Any]]:
    return build_menu_tree(list_nodes(db, chatbot_id=chatbot_id))


def create_menu_node(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    label: str,
    action_type: str,
    parent_id: str | None,
    description: str | None,
    payload: str | None,
    url: str | None,
    sort_order: int,
) -> dict[str, Any]:
    parent_is_child = False
    if parent_id:
        parent = get_node(db, node_id=parent_id, chatbot_id=chatbot_id)
        if parent is None:
            raise MenuValidationError("PARENT_NOT_FOUND", "상위 항목을 찾을 수 없습니다.")
        parent_is_child = parent.parent_id is not None
    validate_node_shape(
        action_type=action_type, parent_is_child=parent_is_child, has_parent=bool(parent_id)
    )
    node = QuickAction(
        organization_id=uuid.UUID(organization_id),
        chatbot_id=uuid.UUID(chatbot_id),
        parent_id=uuid.UUID(parent_id) if parent_id else None,
        label=label.strip(),
        description=(description or "").strip() or None,
        action_type=action_type,
        payload=(payload or "").strip() or None,
        url=(url or "").strip() or None,
        display_location="welcome",
        sort_order=sort_order,
    )
    insert_node(db, node=node)
    db.commit()
    return _to_dict(node)


def update_menu_node(
    db: Session, *, node_id: str, chatbot_id: str, changes: dict[str, Any]
) -> dict[str, Any]:
    node = get_node(db, node_id=node_id, chatbot_id=chatbot_id)
    if node is None:
        raise MenuValidationError("NODE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    for field, column in (
        ("label", "label"),
        ("description", "description"),
        ("payload", "payload"),
        ("url", "url"),
        ("sortOrder", "sort_order"),
        ("isEnabled", "is_enabled"),
    ):
        if field in changes and changes[field] is not None:
            setattr(node, column, changes[field])
    db.commit()
    return _to_dict(node)


def delete_menu_node(db: Session, *, node_id: str, chatbot_id: str) -> int:
    node = get_node(db, node_id=node_id, chatbot_id=chatbot_id)
    if node is None:
        raise MenuValidationError("NODE_NOT_FOUND", "항목을 찾을 수 없습니다.")
    deleted = soft_delete_with_children(db, node=node)
    db.commit()
    return deleted


def _resolve_sort_order(raw: Any, *, current: int) -> int:
    """정렬값 해석. 0도 유효하므로 falsy 판정(`or`)으로 버리지 않는다."""
    if raw is None:
        return current
    return int(raw)


def reorder_menu_nodes(db: Session, *, chatbot_id: str, items: list[dict[str, Any]]) -> int:
    """[{id, sortOrder}] 일괄 저장. 부모 변경은 지원하지 않는다(YAGNI)."""
    changed = 0
    for item in items:
        node = get_node(db, node_id=str(item.get("id")), chatbot_id=chatbot_id)
        if node is None:
            continue
        node.sort_order = _resolve_sort_order(item.get("sortOrder"), current=node.sort_order)
        changed += 1
    db.commit()
    return changed
