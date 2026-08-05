"""탐색 메뉴 노드 검증 규칙.

2단 고정: 대분류(category)는 부모를 가질 수 없고, 자식은 다시 자식을 가질 수 없다.
관리자가 실수로 깊은 트리를 만들어 사용자가 길을 잃는 것을 서버에서 막는다.
"""

import pytest
from app.services.admin.quick_action_service import (
    MenuValidationError,
    _resolve_sort_order,
    build_menu_tree,
    validate_node_shape,
)


def test_mid_level_category_is_allowed() -> None:
    """3단 구조의 핵심 — 1단 분류 아래 2단 분류를 둘 수 있어야 한다."""
    validate_node_shape(action_type="category", parent_depth=1, has_parent=True)


def test_category_at_last_depth_is_rejected() -> None:
    """분류는 하위를 담는 그릇이므로 마지막 단계에는 올 수 없다."""
    with pytest.raises(MenuValidationError) as exc:
        validate_node_shape(action_type="category", parent_depth=2, has_parent=True)
    assert exc.value.code == "CATEGORY_TOO_DEEP"


def test_fourth_level_is_rejected() -> None:
    with pytest.raises(MenuValidationError) as exc:
        validate_node_shape(action_type="question", parent_depth=3, has_parent=True)
    assert exc.value.code == "MENU_DEPTH_EXCEEDED"


def test_question_at_every_allowed_depth() -> None:
    """질문은 1·2·3단 어디에나 올 수 있다(중간 단계에 바로 질문을 둬도 된다)."""
    validate_node_shape(action_type="question", parent_depth=0, has_parent=False)
    validate_node_shape(action_type="question", parent_depth=1, has_parent=True)
    validate_node_shape(action_type="question", parent_depth=2, has_parent=True)


def test_top_level_category_is_allowed() -> None:
    validate_node_shape(action_type="category", parent_depth=0, has_parent=False)


def test_link_without_parent_is_allowed() -> None:
    """기존 평면 퀵액션(부모 없는 link/question)은 계속 허용 — 무회귀."""
    validate_node_shape(action_type="link", parent_depth=0, has_parent=False)


def test_unknown_action_type_is_rejected() -> None:
    with pytest.raises(MenuValidationError) as exc:
        validate_node_shape(action_type="banana", parent_depth=0, has_parent=False)
    assert exc.value.code == "INVALID_ACTION_TYPE"


class _FakeNode:
    """build_menu_tree는 ORM에 의존하지 않는 순수 함수라 가짜 객체로 검증한다."""

    def __init__(self, node_id, label, action_type, parent_id=None, sort_order=1):
        self.id = node_id
        self.label = label
        self.action_type = action_type
        self.parent_id = parent_id
        self.sort_order = sort_order
        self.payload = None
        self.url = None
        self.description = None
        self.is_enabled = True


def test_build_menu_tree_nests_children_under_category() -> None:
    nodes = [
        _FakeNode("c1", "주차시설", "category", sort_order=1),
        _FakeNode("q1", "주차요금", "question", parent_id="c1", sort_order=1),
        _FakeNode("q2", "정기권", "question", parent_id="c1", sort_order=2),
        _FakeNode("c2", "체육시설", "category", sort_order=2),
    ]
    tree = build_menu_tree(nodes)
    assert [n["label"] for n in tree] == ["주차시설", "체육시설"]
    assert [c["label"] for c in tree[0]["children"]] == ["주차요금", "정기권"]
    assert tree[1]["children"] == []


def test_build_menu_tree_nests_three_levels() -> None:
    """3단 — 자식이 부모보다 앞에 와도 올바르게 조립돼야 한다."""
    nodes = [
        _FakeNode("q1", "요금표", "question", parent_id="c2", sort_order=1),
        _FakeNode("c2", "주차요금", "category", parent_id="c1", sort_order=1),
        _FakeNode("c1", "주차시설", "category", sort_order=1),
    ]
    tree = build_menu_tree(nodes)
    assert [n["label"] for n in tree] == ["주차시설"]
    mid = tree[0]["children"]
    assert [n["label"] for n in mid] == ["주차요금"]
    assert [n["label"] for n in mid[0]["children"]] == ["요금표"]


def test_build_menu_tree_keeps_flat_legacy_nodes_at_top() -> None:
    """기존 평면 퀵액션(부모 없는 question)은 최상위에 그대로 남는다 — 무회귀."""
    nodes = [_FakeNode("q9", "이용시간 알려줘", "question", sort_order=1)]
    tree = build_menu_tree(nodes)
    assert len(tree) == 1
    assert tree[0]["actionType"] == "question"
    assert tree[0]["children"] == []


def test_build_menu_tree_drops_orphan_children() -> None:
    """부모가 삭제돼 사라진 자식은 트리에 넣지 않는다(고아 노드 노출 방지)."""
    nodes = [_FakeNode("q1", "고아", "question", parent_id="없는부모")]
    assert build_menu_tree(nodes) == []


def test_resolve_sort_order_accepts_zero() -> None:
    """0은 유효한 정렬값이다 — falsy라는 이유로 버려지면 안 된다."""
    assert _resolve_sort_order(0, current=5) == 0


def test_resolve_sort_order_keeps_current_when_missing() -> None:
    assert _resolve_sort_order(None, current=5) == 5


def test_resolve_sort_order_coerces_numeric_string() -> None:
    assert _resolve_sort_order("3", current=5) == 3


# ── 라우터 계약 ────────────────────────────────────────────────────────────────
# 프론트엔드는 쿼리스트링을 camelCase(chatbotId)로 보낸다. 라우터가 alias 없이
# chatbot_id로 받으면 FastAPI가 필수 파라미터를 못 찾아 422를 내고, 화면에는
# 원인을 알 수 없는 일반 오류만 뜬다(실제로 운영에서 한 번 발생).


def _query_param_names(path: str, method: str) -> set[str]:
    from app.main import app

    for route in app.routes:
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return {p.alias for p in route.dependant.query_params}
    raise AssertionError(f"라우트를 찾지 못함: {method} {path}")


def test_list_endpoint_accepts_camel_case_chatbot_id() -> None:
    assert "chatbotId" in _query_param_names("/api/admin/quick-actions", "GET")


def test_delete_endpoint_accepts_camel_case_chatbot_id() -> None:
    assert "chatbotId" in _query_param_names("/api/admin/quick-actions/{node_id}", "DELETE")
