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


MAX_MENU_DEPTH = 3


def validate_node_shape(*, action_type: str, parent_depth: int, has_parent: bool) -> None:
    """노드 하나의 모양이 깊이 규칙에 맞는지 검사.

    parent_depth: 부모 노드의 깊이(최상위=1). 부모가 없으면 무시된다.
                  새 노드의 깊이는 parent_depth + 1 이 된다.

    분류(category)는 하위를 담는 그릇이므로 마지막 단계에 올 수 없다.
    질문·링크는 어느 단계에나 올 수 있다(중간 단계에 바로 질문을 두어도 된다).
    """
    if action_type not in ACTION_TYPES:
        raise MenuValidationError("INVALID_ACTION_TYPE", f"허용되지 않는 유형입니다: {action_type}")

    depth = parent_depth + 1 if has_parent else 1
    if depth > MAX_MENU_DEPTH:
        raise MenuValidationError(
            "MENU_DEPTH_EXCEEDED", f"메뉴는 {MAX_MENU_DEPTH}단까지만 만들 수 있습니다."
        )
    if action_type == "category" and depth >= MAX_MENU_DEPTH:
        raise MenuValidationError(
            "CATEGORY_TOO_DEEP",
            f"{MAX_MENU_DEPTH}단째에는 분류를 만들 수 없습니다. 질문이나 링크로 등록해 주세요.",
        )


def _node_depth(db: Session, *, node: Any, chatbot_id: str) -> int:
    """노드의 깊이(최상위=1). 부모 사슬을 거슬러 올라가며 센다.

    MAX_MENU_DEPTH를 넘는 순간 멈춘다 — 데이터가 손상돼 사슬이 순환해도
    무한 루프에 빠지지 않게 하기 위한 안전장치다.
    """
    depth = 1
    current = node
    while current.parent_id is not None and depth < MAX_MENU_DEPTH + 1:
        parent = get_node(db, node_id=str(current.parent_id), chatbot_id=chatbot_id)
        if parent is None:
            break
        depth += 1
        current = parent
    return depth


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
    """평면 노드 목록 → 최대 MAX_MENU_DEPTH 단 트리. 부모가 없는 자식은 버린다.

    입력 순서가 부모보다 자식이 먼저일 수 있으므로, 전체를 먼저 dict로 만든 뒤
    부모에 연결한다(2단 시절에는 최상위를 먼저 훑는 방식이라 3단을 담지 못했다).
    """
    by_id: dict[str, dict[str, Any]] = {str(node.id): _to_dict(node) for node in nodes}
    roots: list[dict[str, Any]] = []
    for node in nodes:
        item = by_id[str(node.id)]
        if node.parent_id is None:
            roots.append(item)
            continue
        parent = by_id.get(str(node.parent_id))
        if parent is None:
            continue  # 고아 노드
        parent["children"].append(item)
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
    parent_depth = 0
    if parent_id:
        parent = get_node(db, node_id=parent_id, chatbot_id=chatbot_id)
        if parent is None:
            raise MenuValidationError("PARENT_NOT_FOUND", "상위 항목을 찾을 수 없습니다.")
        parent_depth = _node_depth(db, node=parent, chatbot_id=chatbot_id)
    validate_node_shape(
        action_type=action_type, parent_depth=parent_depth, has_parent=bool(parent_id)
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
