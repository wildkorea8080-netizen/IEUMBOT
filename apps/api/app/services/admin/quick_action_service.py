"""탐색 메뉴(퀵액션) 서비스 — 2단 트리 검증·조회·변경."""

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
