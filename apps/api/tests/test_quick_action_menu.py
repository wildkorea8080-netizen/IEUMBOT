"""탐색 메뉴 노드 검증 규칙.

2단 고정: 대분류(category)는 부모를 가질 수 없고, 자식은 다시 자식을 가질 수 없다.
관리자가 실수로 깊은 트리를 만들어 사용자가 길을 잃는 것을 서버에서 막는다.
"""

import pytest
from app.services.admin.quick_action_service import (
    MenuValidationError,
    validate_node_shape,
)


def test_category_cannot_have_parent() -> None:
    with pytest.raises(MenuValidationError) as exc:
        validate_node_shape(action_type="category", parent_is_child=False, has_parent=True)
    assert exc.value.code == "CATEGORY_CANNOT_HAVE_PARENT"


def test_child_of_child_is_rejected() -> None:
    """부모로 지정한 노드가 이미 자식이면 3단이 된다 → 거부."""
    with pytest.raises(MenuValidationError) as exc:
        validate_node_shape(action_type="question", parent_is_child=True, has_parent=True)
    assert exc.value.code == "MENU_DEPTH_EXCEEDED"


def test_question_under_category_is_allowed() -> None:
    validate_node_shape(action_type="question", parent_is_child=False, has_parent=True)


def test_top_level_category_is_allowed() -> None:
    validate_node_shape(action_type="category", parent_is_child=False, has_parent=False)


def test_link_without_parent_is_allowed() -> None:
    """기존 평면 퀵액션(부모 없는 link/question)은 계속 허용 — 무회귀."""
    validate_node_shape(action_type="link", parent_is_child=False, has_parent=False)


def test_unknown_action_type_is_rejected() -> None:
    with pytest.raises(MenuValidationError) as exc:
        validate_node_shape(action_type="banana", parent_is_child=False, has_parent=False)
    assert exc.value.code == "INVALID_ACTION_TYPE"
