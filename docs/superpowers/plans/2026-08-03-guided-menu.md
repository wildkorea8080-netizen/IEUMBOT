# 탐색 메뉴(2단 가이드 메뉴) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위젯에서 [대분류] → [질문] 2단 버튼으로 탐색하고, 관리자가 콘솔에서 그 메뉴를 직접 관리할 수 있게 한다.

**Architecture:** 기존 `quick_actions` 테이블에 `parent_id`·`description`을 추가해 2단 트리를 만든다. 메뉴 노드는 답변이 아니라 **질문**을 담고, 클릭 시 기존 채팅 API로 질문을 전송해 RAG/FAQ가 답변한다. 탐색 상태는 위젯 클라이언트에만 둔다(서버 무상태). `category` 노드가 하나도 없으면 기존 평면 퀵액션과 100% 동일하게 동작한다.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic / Next.js 14 App Router / TypeScript 위젯(esbuild, Shadow DOM) / pytest

**설계 문서:** `docs/superpowers/specs/2026-08-03-guided-menu-design.md`

---

## File Structure

**백엔드 (apps/api)**
- Create: `alembic/versions/20260803_0049_quick_action_menu_tree.py` — 컬럼 2개 + 인덱스
- Modify: `app/models/quick_actions.py` — `parent_id`, `description` 매핑
- Create: `app/repositories/admin/quick_action_repository.py` — DB 접근만
- Create: `app/services/admin/quick_action_service.py` — 검증·트리 조립
- Create: `app/api/admin/quick_actions_router.py` — 엔드포인트(얇게)
- Modify: `app/api/admin/router.py` — 라우터 등록
- Modify: `app/core/menu_permissions.py` — `guided_menu` 키 추가
- Modify: `app/schemas/widget.py` — `WidgetQuickAction`에 필드 2개
- Modify: `app/api/widget/router.py:207-218` — config 응답에 필드 2개
- Create: `tests/test_quick_action_menu.py` — 검증 규칙 회귀 가드

**프론트엔드 (apps/web)**
- Create: `lib/api/quick-actions-types.ts` — 타입
- Create: `lib/api/quick-actions.ts` — API 함수
- Modify: `components/layout/admin-nav.ts:29` — 사이드바 항목
- Modify: `components/layout/admin-route-meta.ts` — 브레드크럼
- Modify: `lib/admin-ui/menu-permissions.ts` — `guided_menu` 키
- Rewrite: `app/admin/quick-actions/page.tsx` — 관리 화면(스텁 대체)

**위젯 (packages/widget)**
- Modify: `src/types.ts` — `WidgetQuickAction`에 필드 2개
- Modify: `src/bootstrap/widget-app.ts` — 메뉴 카드 렌더·탐색 상태·선택 에코

---

## Task 1: DB 스키마 — parent_id / description

**Files:**
- Create: `apps/api/alembic/versions/20260803_0049_quick_action_menu_tree.py`
- Modify: `apps/api/app/models/quick_actions.py`

- [ ] **Step 1: 마이그레이션 파일 작성**

`apps/api/alembic/versions/20260803_0049_quick_action_menu_tree.py`:

```python
"""quick_actions 2단 메뉴 트리 (parent_id, description)

대분류(category) → 질문(question/link) 2단 구조를 위한 자기참조 FK와
카드 부제용 description 추가. 둘 다 NULL 허용이라 기존 행은 영향 없음
(parent_id=NULL → 기존처럼 평면 퀵액션으로 동작).

Revision ID: 20260803_0049
Revises: 20260716_0048
Create Date: 2026-08-03 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260803_0049"
down_revision: str | None = "20260716_0048"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "quick_actions",
        sa.Column("parent_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("quick_actions", sa.Column("description", sa.String(length=300), nullable=True))
    op.create_foreign_key(
        "fk_quick_actions_parent_id",
        "quick_actions",
        "quick_actions",
        ["parent_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_quick_actions_chatbot_parent_order",
        "quick_actions",
        ["chatbot_id", "parent_id", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_quick_actions_chatbot_parent_order", table_name="quick_actions")
    op.drop_constraint("fk_quick_actions_parent_id", "quick_actions", type_="foreignkey")
    op.drop_column("quick_actions", "description")
    op.drop_column("quick_actions", "parent_id")
```

- [ ] **Step 2: 모델에 컬럼 추가**

`apps/api/app/models/quick_actions.py` — `__table_args__` 의 Index 튜플에 한 줄 추가하고, `label` 위에 컬럼 2개를 넣는다:

```python
    __table_args__ = (
        Index("ix_quick_actions_org_chatbot_order", "organization_id", "chatbot_id", "sort_order"),
        Index("ix_quick_actions_chatbot_parent_order", "chatbot_id", "parent_id", "sort_order"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_settings.id", ondelete="CASCADE"), nullable=False
    )
    # 2단 메뉴 트리: NULL이면 대분류(category), 값이 있으면 그 대분류의 자식.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quick_actions.id", ondelete="CASCADE"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
```

- [ ] **Step 3: 마이그레이션 검증 (실행하지 말 것)**

로컬 `.env`는 공용 원격 DB(Neon)를 가리킨다. **`alembic upgrade head`를 실행하지 않는다.**
실제 적용은 배포 시 `apps/api/scripts/start.sh`가 담당한다.
오프라인 모드로 SQL만 생성해 마이그레이션이 올바른지 확인한다:

Run: `cd apps/api && alembic upgrade 20260716_0048:20260803_0049 --sql`
Expected: `ALTER TABLE quick_actions ADD COLUMN parent_id UUID` / `ADD COLUMN description VARCHAR(300)` /
`CREATE INDEX ix_quick_actions_chatbot_parent_order` 를 포함한 SQL이 출력되고 에러가 없을 것

모델과 마이그레이션이 같은 컬럼을 정의하는지도 확인:

Run: `cd apps/api && python -c "from app.models import QuickAction; print(QuickAction.parent_id, QuickAction.description)"`
Expected: 두 컬럼 객체가 출력되고 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add apps/api/alembic/versions/20260803_0049_quick_action_menu_tree.py apps/api/app/models/quick_actions.py
git commit -m "feat(api): quick_actions에 2단 메뉴 트리용 parent_id/description 추가"
```

---

## Task 2: 검증 규칙 — 깊이 2단 강제

먼저 실패하는 테스트를 만들고, 그 다음 검증 함수를 구현한다. 검증은 순수 함수라 DB 없이 테스트한다.

**Files:**
- Create: `apps/api/tests/test_quick_action_menu.py`
- Create: `apps/api/app/services/admin/quick_action_service.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/tests/test_quick_action_menu.py`:

```python
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/api && python -m pytest tests/test_quick_action_menu.py -q`
Expected: FAIL — `ModuleNotFoundError` 또는 `ImportError: cannot import name 'validate_node_shape'`

- [ ] **Step 3: 검증 함수 구현**

`apps/api/app/services/admin/quick_action_service.py` (새 파일, 우선 검증 부분만):

```python
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
        raise MenuValidationError(
            "MENU_DEPTH_EXCEEDED", "메뉴는 2단까지만 만들 수 있습니다."
        )
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/api && python -m pytest tests/test_quick_action_menu.py -q`
Expected: `6 passed`

- [ ] **Step 5: 커밋**

```bash
git add apps/api/tests/test_quick_action_menu.py apps/api/app/services/admin/quick_action_service.py
git commit -m "feat(api): 탐색 메뉴 2단 깊이 검증 규칙"
```

---

## Task 3: 리포지터리 — DB 접근

**Files:**
- Create: `apps/api/app/repositories/admin/quick_action_repository.py`

- [ ] **Step 1: 리포지터리 작성**

```python
"""탐색 메뉴(퀵액션) DB 접근. 비즈니스 규칙은 service에 둔다."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import QuickAction


def list_nodes(db: Session, *, chatbot_id: str) -> list[QuickAction]:
    """삭제되지 않은 노드 전체를 정렬 순서대로."""
    stmt = (
        select(QuickAction)
        .where(
            QuickAction.chatbot_id == uuid.UUID(chatbot_id),
            QuickAction.is_deleted.is_(False),
        )
        .order_by(QuickAction.sort_order.asc(), QuickAction.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def get_node(db: Session, *, node_id: str, chatbot_id: str) -> QuickAction | None:
    stmt = select(QuickAction).where(
        QuickAction.id == uuid.UUID(node_id),
        QuickAction.chatbot_id == uuid.UUID(chatbot_id),
        QuickAction.is_deleted.is_(False),
    )
    return db.execute(stmt).scalar_one_or_none()


def list_children(db: Session, *, parent_id: str) -> list[QuickAction]:
    stmt = select(QuickAction).where(
        QuickAction.parent_id == uuid.UUID(parent_id),
        QuickAction.is_deleted.is_(False),
    )
    return list(db.execute(stmt).scalars().all())


def insert_node(db: Session, *, node: QuickAction) -> QuickAction:
    db.add(node)
    db.flush()
    return node


def soft_delete_with_children(db: Session, *, node: QuickAction) -> int:
    """노드를 소프트 삭제. 대분류면 자식도 함께. 삭제된 개수 반환."""
    now = datetime.now(UTC)
    targets = [node, *list_children(db, parent_id=str(node.id))]
    for target in targets:
        target.is_deleted = True
        target.deleted_at = now
    db.flush()
    return len(targets)
```

- [ ] **Step 2: import 확인**

Run: `cd apps/api && python -c "from app.repositories.admin.quick_action_repository import list_nodes; print('ok')"`
Expected: `ok`

- [ ] **Step 3: 커밋**

```bash
git add apps/api/app/repositories/admin/quick_action_repository.py
git commit -m "feat(api): 탐색 메뉴 리포지터리"
```

---

## Task 4: 서비스 — 트리 조립 + CRUD

**Files:**
- Modify: `apps/api/app/services/admin/quick_action_service.py`
- Modify: `apps/api/tests/test_quick_action_menu.py`

- [ ] **Step 1: 트리 조립 테스트 추가**

`apps/api/tests/test_quick_action_menu.py` 맨 아래에 추가:

```python
from app.services.admin.quick_action_service import build_menu_tree


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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/api && python -m pytest tests/test_quick_action_menu.py -q`
Expected: FAIL — `ImportError: cannot import name 'build_menu_tree'`

- [ ] **Step 3: 트리 조립 + CRUD 구현**

`apps/api/app/services/admin/quick_action_service.py` 에 추가(기존 검증 코드 아래):

```python
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


def reorder_menu_nodes(db: Session, *, chatbot_id: str, items: list[dict[str, Any]]) -> int:
    """[{id, sortOrder}] 일괄 저장. 부모 변경은 지원하지 않는다(YAGNI)."""
    changed = 0
    for item in items:
        node = get_node(db, node_id=str(item.get("id")), chatbot_id=chatbot_id)
        if node is None:
            continue
        node.sort_order = int(item.get("sortOrder") or node.sort_order)
        changed += 1
    db.commit()
    return changed
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/api && python -m pytest tests/test_quick_action_menu.py -q`
Expected: `9 passed`

- [ ] **Step 5: 커밋**

```bash
git add apps/api/app/services/admin/quick_action_service.py apps/api/tests/test_quick_action_menu.py
git commit -m "feat(api): 탐색 메뉴 트리 조립 + CRUD 서비스"
```

---

## Task 5: 관리자 API 라우터

**Files:**
- Create: `apps/api/app/api/admin/quick_actions_router.py`
- Modify: `apps/api/app/api/admin/router.py`

- [ ] **Step 1: 라우터 작성**

```python
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


def _raise_validation(exc: MenuValidationError) -> None:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/quick-actions")
def admin_list_quick_actions(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> list[dict[str, Any]]:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    return list_menu_tree(db, chatbot_id=chatbot_id)


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
        _raise_validation(exc)


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
        _raise_validation(exc)


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
        _raise_validation(exc)


@router.post("/quick-actions/reorder")
def admin_reorder_quick_actions(
    body: MenuReorderRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict[str, int]:
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=body.chatbot_id)
    return {"updated": reorder_menu_nodes(db, chatbot_id=body.chatbot_id, items=body.items)}
```

- [ ] **Step 2: 라우터 등록**

`apps/api/app/api/admin/router.py` — import 블록에 추가:

```python
from app.api.admin.quick_actions_router import router as quick_actions_router
```

`router.include_router(faq_router)` 바로 아래에 추가:

```python
router.include_router(quick_actions_router)
```

- [ ] **Step 3: 앱 로딩 확인**

Run: `cd apps/api && python -c "from app.main import app; print([r.path for r in app.routes if 'quick-actions' in r.path])"`
Expected: 5개 경로 출력 (`/api/admin/quick-actions` 등)

- [ ] **Step 4: 커밋**

```bash
git add apps/api/app/api/admin/quick_actions_router.py apps/api/app/api/admin/router.py
git commit -m "feat(api): 탐색 메뉴 관리자 CRUD 엔드포인트"
```

---

## Task 6: 위젯 config에 트리 정보 전달

**Files:**
- Modify: `apps/api/app/schemas/widget.py:4-11`
- Modify: `apps/api/app/api/widget/router.py:207-218`

- [ ] **Step 1: 스키마에 필드 추가**

`apps/api/app/schemas/widget.py` 의 `WidgetQuickAction`:

```python
class WidgetQuickAction(ApiSchema):
    id: str
    label: str
    action_type: str
    payload: str | None = None
    url: str | None = None
    display_location: str
    sort_order: int
    parent_id: str | None = None
    description: str | None = None
```

- [ ] **Step 2: config 응답에 값 채우기**

`apps/api/app/api/widget/router.py` 의 `quick_actions=[...]` 블록:

```python
        quick_actions=[
            WidgetQuickAction(
                id=str(row.id),
                label=row.label,
                action_type=row.action_type,
                payload=row.payload,
                url=row.url,
                display_location=row.display_location,
                sort_order=row.sort_order,
                parent_id=str(row.parent_id) if row.parent_id else None,
                description=row.description,
            )
            for row in quick_action_rows
        ],
```

- [ ] **Step 3: 응답 형태 확인**

Run: `cd apps/api && python -c "
from app.schemas.widget import WidgetQuickAction
a = WidgetQuickAction(id='1', label='주차', action_type='category', display_location='welcome', sort_order=1)
print(a.model_dump(by_alias=True))
"`
Expected: `parentId`, `description` 키가 포함된 dict 출력

- [ ] **Step 4: 커밋**

```bash
git add apps/api/app/schemas/widget.py apps/api/app/api/widget/router.py
git commit -m "feat(api): 위젯 config에 메뉴 트리 필드(parentId/description) 전달"
```

---

## Task 7: 메뉴 권한 키 추가 (백엔드 + 프론트)

**Files:**
- Modify: `apps/api/app/core/menu_permissions.py:10-24`
- Modify: `apps/web/lib/admin-ui/menu-permissions.ts:8-38`

- [ ] **Step 1: 백엔드 키 추가**

`apps/api/app/core/menu_permissions.py` — `"conditional",` 아래 줄에 추가:

```python
    "guided_menu",          # 탐색 메뉴
```

- [ ] **Step 2: 프론트 키 추가**

`apps/web/lib/admin-ui/menu-permissions.ts` — `MenuKey` 유니온의 `| "conditional"` 아래에 추가:

```typescript
  | "guided_menu"
```

`MENU_CATALOG` 배열의 `conditional` 항목 아래에 추가:

```typescript
  { key: "guided_menu", label: "탐색 메뉴", href: "/admin/quick-actions" },
```

- [ ] **Step 3: 양쪽 키 일치 확인**

Run: `cd apps/api && python -c "
from app.core.menu_permissions import MENU_KEYS
print('guided_menu' in MENU_KEYS, len(MENU_KEYS))
"`
Expected: `True 14`

- [ ] **Step 4: 커밋**

```bash
git add apps/api/app/core/menu_permissions.py apps/web/lib/admin-ui/menu-permissions.ts
git commit -m "feat: 탐색 메뉴 접근 권한 키(guided_menu) 추가"
```

---

## Task 8: 사이드바 항목 + 브레드크럼

**Files:**
- Modify: `apps/web/components/layout/admin-nav.ts:29`
- Modify: `apps/web/components/layout/admin-route-meta.ts`

- [ ] **Step 1: 사이드바에 항목 추가**

`apps/web/components/layout/admin-nav.ts` — "AI 설정" 그룹의 `조건별 답변 설정` 줄 아래에 추가:

```typescript
      { label: "탐색 메뉴",      href: "/admin/quick-actions", icon: "ListTree" },
```

- [ ] **Step 2: 브레드크럼 추가**

`apps/web/components/layout/admin-route-meta.ts` — `/admin/ai/conditional` 줄 아래에 추가:

```typescript
  { href: "/admin/quick-actions", meta: { title: "탐색 메뉴", breadcrumbs: ["기관관리자", "AI 설정", "탐색 메뉴"] } },
```

- [ ] **Step 3: 아이콘 존재 확인**

Run: `cd apps/web && node -e "const i=require('lucide-react'); console.log(typeof i.ListTree)"`
Expected: `function` — `undefined`면 `List` 로 교체할 것

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/layout/admin-nav.ts apps/web/components/layout/admin-route-meta.ts
git commit -m "feat(web): 사이드바에 탐색 메뉴 항목 추가"
```

---

## Task 9: 프론트 API 클라이언트

**Files:**
- Create: `apps/web/lib/api/quick-actions-types.ts`
- Create: `apps/web/lib/api/quick-actions.ts`

- [ ] **Step 1: 타입 정의**

`apps/web/lib/api/quick-actions-types.ts`:

```typescript
export type MenuActionType = "category" | "question" | "link";

export type MenuNode = {
  id: string;
  label: string;
  description: string | null;
  actionType: MenuActionType;
  payload: string | null;
  url: string | null;
  sortOrder: number;
  isEnabled: boolean;
  children: MenuNode[];
};

export type MenuNodeCreateInput = {
  chatbotId: string;
  label: string;
  actionType: MenuActionType;
  parentId?: string | null;
  description?: string | null;
  payload?: string | null;
  url?: string | null;
  sortOrder?: number;
};

export type MenuNodeUpdateInput = {
  chatbotId: string;
  label?: string;
  description?: string | null;
  payload?: string | null;
  url?: string | null;
  sortOrder?: number;
  isEnabled?: boolean;
};
```

- [ ] **Step 2: API 함수 작성**

`apps/web/lib/api/quick-actions.ts` — 이 저장소의 클라이언트는 `.get/.post` 가 아니라
**`apiClient.request<T>(path, { method, body })`** 하나만 제공한다(`lib/api/client.ts:14`).
`admin-operations.ts` 와 동일한 호출 형태를 쓴다:

```typescript
import { apiClient } from "./index";
import type {
  MenuNode,
  MenuNodeCreateInput,
  MenuNodeUpdateInput,
} from "./quick-actions-types";

export async function getMenuTree(chatbotId: string): Promise<MenuNode[]> {
  return apiClient.request<MenuNode[]>(
    `/admin/quick-actions?chatbotId=${encodeURIComponent(chatbotId)}`,
  );
}

export async function createMenuNode(input: MenuNodeCreateInput): Promise<MenuNode> {
  return apiClient.request<MenuNode>("/admin/quick-actions", { method: "POST", body: input });
}

export async function updateMenuNode(
  nodeId: string,
  input: MenuNodeUpdateInput,
): Promise<MenuNode> {
  return apiClient.request<MenuNode>(`/admin/quick-actions/${nodeId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteMenuNode(nodeId: string, chatbotId: string): Promise<void> {
  await apiClient.request<void>(
    `/admin/quick-actions/${nodeId}?chatbotId=${encodeURIComponent(chatbotId)}`,
    { method: "DELETE" },
  );
}

export async function reorderMenuNodes(
  chatbotId: string,
  items: { id: string; sortOrder: number }[],
): Promise<{ updated: number }> {
  return apiClient.request<{ updated: number }>("/admin/quick-actions/reorder", {
    method: "POST",
    body: { chatbotId, items },
  });
}
```

- [ ] **Step 3: 타입 검사**

Run: `cd apps/web && pnpm exec tsc --project tsconfig.json --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add apps/web/lib/api/quick-actions-types.ts apps/web/lib/api/quick-actions.ts
git commit -m "feat(web): 탐색 메뉴 API 클라이언트"
```

---

## Task 10: 관리 화면

**Files:**
- Rewrite: `apps/web/app/admin/quick-actions/page.tsx`

- [ ] **Step 1: 화면 구현**

기존 스텁 전체를 교체한다. 챗봇 선택은 이 저장소의 표준인 **`useSelectedChatbot()` 훅**
(`lib/admin-ui/use-selected-chatbot.ts`)을 쓴다 — 사이드바 좌측 상단의 전역 '현재 챗봇'
선택을 구독하므로 페이지마다 별도 선택기를 두지 않는다.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { useSelectedChatbot } from "../../../lib/admin-ui/use-selected-chatbot";
import {
  createMenuNode,
  deleteMenuNode,
  getMenuTree,
  updateMenuNode,
} from "../../../lib/api/quick-actions";
import type { MenuNode } from "../../../lib/api/quick-actions-types";

export default function QuickActionsPage() {
  const selectedChatbot = useSelectedChatbot();
  const chatbotId = selectedChatbot?.id ?? "";
  const [tree, setTree] = useState<MenuNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [childDrafts, setChildDrafts] = useState<Record<string, string>>({});

  const reload = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setTree(await getMenuTree(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "메뉴를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(chatbotId);
  }, [chatbotId, reload]);

  async function addCategory() {
    const label = newCategory.trim();
    if (!label || !chatbotId) return;
    await createMenuNode({
      chatbotId,
      label,
      actionType: "category",
      sortOrder: tree.length + 1,
    });
    setNewCategory("");
    await reload(chatbotId);
  }

  async function addQuestion(parent: MenuNode) {
    const label = (childDrafts[parent.id] ?? "").trim();
    if (!label) return;
    await createMenuNode({
      chatbotId,
      label,
      actionType: "question",
      parentId: parent.id,
      payload: label,
      sortOrder: parent.children.length + 1,
    });
    setChildDrafts((prev) => ({ ...prev, [parent.id]: "" }));
    await reload(chatbotId);
  }

  async function remove(nodeId: string) {
    await deleteMenuNode(nodeId, chatbotId);
    await reload(chatbotId);
  }

  async function toggleEnabled(node: MenuNode) {
    await updateMenuNode(node.id, { chatbotId, isEnabled: !node.isEnabled });
    await reload(chatbotId);
  }

  return (
    <div className="space-y-4">
      <PagePanel
        title="탐색 메뉴"
        description="위젯 시작화면에 보일 대분류와, 대분류를 누르면 나올 질문 버튼을 관리합니다. 질문 버튼을 누르면 등록한 질문이 챗봇에 전송되어 답변이 생성됩니다."
      />

      {error && <div className="badge-danger">{error}</div>}
      {loading && <div style={{ fontSize: 13, color: "#64748b" }}>불러오는 중…</div>}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input-field"
            placeholder="대분류 이름 (예: 주차시설)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button type="button" className="btn-primary" onClick={() => void addCategory()}>
            대분류 추가
          </button>
        </div>
      </div>

      {tree.map((node) => (
        <div key={node.id} className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <strong style={{ fontSize: 15 }}>{node.label}</strong>
            {node.actionType === "category" && node.children.length === 0 && (
              <span className="badge-warning">질문 없음 — 위젯에 표시되지 않습니다</span>
            )}
            {!node.isEnabled && <span className="badge-neutral">비활성</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button type="button" className="btn-secondary" onClick={() => void toggleEnabled(node)}>
                {node.isEnabled ? "숨기기" : "표시"}
              </button>
              <button type="button" className="btn-danger" onClick={() => void remove(node.id)}>
                삭제
              </button>
            </div>
          </div>

          <ul style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {node.children.map((child) => (
              <li key={child.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                <span>· {child.label}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 12 }}
                  onClick={() => void remove(child.id)}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input-field"
              placeholder="질문 버튼 이름 (예: 주차요금)"
              value={childDrafts[node.id] ?? ""}
              onChange={(e) => setChildDrafts((p) => ({ ...p, [node.id]: e.target.value }))}
            />
            <button type="button" className="btn-secondary" onClick={() => void addQuestion(node)}>
              질문 추가
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

> 챗봇이 선택되지 않은 상태(`chatbotId === ""`)에서는 `reload`가 즉시 반환하므로 빈 화면이
> 보인다. 다른 관리 화면과 동일한 동작이다.

- [ ] **Step 2: 타입 검사 + 빌드**

Run: `cd apps/web && pnpm exec tsc --project tsconfig.json --noEmit && cd ../.. && pnpm build:web`
Expected: 둘 다 성공

- [ ] **Step 3: 커밋**

```bash
git add apps/web/app/admin/quick-actions/page.tsx
git commit -m "feat(web): 탐색 메뉴 관리 화면(스텁 대체)"
```

---

## Task 11: 위젯 — 메뉴 카드 렌더 + 탐색

**Files:**
- Modify: `packages/widget/src/types.ts`
- Modify: `packages/widget/src/bootstrap/widget-app.ts:1451-1474`

- [ ] **Step 1: 위젯 타입에 필드 추가**

`packages/widget/src/types.ts` 의 `WidgetQuickAction` 타입에 두 줄 추가:

```typescript
  parentId?: string | null;
  description?: string | null;
```

- [ ] **Step 2: 시작화면 렌더를 대분류 기준으로 변경**

`packages/widget/src/bootstrap/widget-app.ts` — `renderQuickActions` 전체를 교체:

```typescript
  private renderQuickActions(actions: WidgetQuickAction[]) {
    this.quickActionsWrap.innerHTML = "";
    const categories = actions.filter((item) => item.actionType === "category");
    // 대분류가 하나도 없으면 기존 평면 퀵액션 동작을 그대로 유지한다(무회귀).
    const visible = categories.length
      ? categories.filter((c) => actions.some((a) => a.parentId === c.id)).slice(0, 8)
      : actions.filter((item) => item.displayLocation === "welcome").slice(0, 6);
    if (visible.length === 0) {
      this.quickActionsWrap.style.display = "none";
      return;
    }
    this.quickActionsWrap.style.display = "flex";
    for (const action of visible) {
      const button = createElement(document, "button", "ieum-quick-action");
      button.type = "button";
      button.textContent = action.label;
      button.title = action.label;
      button.addEventListener("click", () => {
        void this.handleMenuAction(action);
      });
      this.quickActionsWrap.appendChild(button);
    }
  }

  /** 메뉴 노드 클릭 처리 — 선택을 사용자 말풍선으로 남기고 유형에 따라 분기. */
  private async handleMenuAction(action: WidgetQuickAction): Promise<void> {
    if (action.actionType === "link" && action.url) {
      window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action.actionType === "category") {
      this.currentCategoryId = action.id;
      this.pushMessage({
        id: `user_menu_${Date.now()}`,
        role: "user",
        text: `#${action.label}`,
        timestamp: Date.now(),
      });
      this.renderMenuCard(action);
      return;
    }
    this.input.value = action.payload?.trim() || action.label;
    await this.sendCurrentInput();
  }

  /** 대분류 카드 — 제목 + 설명 + 자식 질문 버튼 + 처음으로. */
  private renderMenuCard(category: WidgetQuickAction): void {
    const children = (this.config?.quickActions ?? []).filter(
      (item) => item.parentId === category.id,
    );
    const row = createElement(document, "div", "ieum-message assistant");
    const card = createElement(document, "div", "ieum-bubble ieum-menu-card");

    const title = createElement(document, "div", "ieum-menu-card-title");
    title.textContent = category.label;
    card.appendChild(title);

    if (category.description) {
      const desc = createElement(document, "div", "ieum-menu-card-desc");
      desc.textContent = category.description;
      card.appendChild(desc);
    }

    const list = createElement(document, "div", "ieum-menu-card-actions");
    for (const child of children) {
      const button = createElement(document, "button", "ieum-quick-action");
      button.type = "button";
      button.textContent = child.label;
      button.addEventListener("click", () => {
        void this.handleMenuAction(child);
      });
      list.appendChild(button);
    }
    card.appendChild(list);

    const home = createElement(document, "button", "ieum-menu-home");
    home.type = "button";
    home.textContent = "↑ 처음으로";
    home.addEventListener("click", () => {
      this.currentCategoryId = null;
      this.renderQuickActions(this.config?.quickActions ?? []);
      this.quickActionsWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    card.appendChild(home);

    row.appendChild(card);
    this.messagesWrap.appendChild(row);
    this.messagesWrap.scrollTop = this.messagesWrap.scrollHeight;
  }
```

- [ ] **Step 3: 탐색 상태 필드 선언**

같은 파일에서 `private readonly quickActionsWrap: HTMLDivElement;` 선언 바로 아래에 추가:

```typescript
  private currentCategoryId: string | null = null;
```

- [ ] **Step 4: 카드 스타일 추가**

같은 파일의 스타일 문자열에서 `.ieum-quick-action` 규칙을 찾아 그 아래에 추가:

```css
.ieum-menu-card { max-width: 92%; }
.ieum-menu-card-title { font-size:14.5px; font-weight:700; color:#111827; margin-bottom:4px; }
.ieum-menu-card-desc { font-size:12.5px; color:#64748b; margin-bottom:10px; }
.ieum-menu-card-actions { display:flex; flex-wrap:wrap; gap:6px; }
.ieum-menu-home {
  margin-top:10px; background:none; border:none; padding:0;
  font-size:12px; color:#2563eb; cursor:pointer; font-family:inherit;
}
.ieum-menu-home:hover { text-decoration:underline; }
```

- [ ] **Step 5: 빌드 확인**

Run: `cd /d/coding/IEUMBOT && pnpm build:widget`
Expected: `widget.js` 크기 출력, 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add packages/widget/src/types.ts packages/widget/src/bootstrap/widget-app.ts apps/web/public/widget.js
git commit -m "feat(widget): 2단 탐색 메뉴 카드 렌더 + 선택 에코"
```

---

## Task 12: 전체 검증 + 강동구 메뉴 등록

**Files:** 없음 (운영 확인)

- [ ] **Step 1: 백엔드 테스트 전체 실행**

Run: `cd apps/api && python -m pytest tests/ -q`
Expected: 기존 12개 + 신규 9개 = `21 passed`

- [ ] **Step 2: 프론트 빌드**

Run: `cd /d/coding/IEUMBOT && pnpm build:web`
Expected: 성공

- [ ] **Step 3: 배포 후 무회귀 확인**

배포 완료 뒤, 대분류를 하나도 만들지 않은 챗봇(예: 서울노동권익센터)의 위젯을 열어
**기존과 동일하게** 동작하는지 확인한다. 시작화면 버튼·답변 흐름에 변화가 없어야 한다.

- [ ] **Step 4: 강동구 메뉴 등록**

관리 콘솔 → 탐색 메뉴에서 강동구도시관리공단 챗봇에 등록:

| 대분류 | 질문 버튼 |
|---|---|
| 체육시설 | 수영장 이용시간, 체육관 예약방법, 이용요금, 휴관일 |
| 문화·복지시설 | 구민회관 대관, 캠핑장 예약, 추모의 집 이용안내 |
| 주차시설 | 주차요금, 정기권 신청, 거주자우선주차, 부정주차 |
| 공단소개 | 위치·연락처, 채용정보, 조직안내 |

- [ ] **Step 5: 실제 탐색 확인**

`https://chat.deepsecu.co.kr/igangdong_test.html` 에서:
1. 위젯 열기 → 대분류 4개가 보이는가
2. '주차시설' 클릭 → `#주차시설` 말풍선 + 질문 버튼 카드가 나오는가
3. '주차요금' 클릭 → `#주차요금` 말풍선 + RAG 답변(추천질문 포함)이 나오는가
4. '↑ 처음으로' 클릭 → 시작 버튼으로 돌아오는가

- [ ] **Step 6: 커밋 (문서 갱신이 있을 경우)**

```bash
git add -A
git commit -m "docs: 탐색 메뉴 롤아웃 결과 반영"
```

---

## Self-Review 결과

**스펙 커버리지:** 설계 문서의 3절(스키마)→Task 1, 3.3절(깊이 검증)→Task 2, 5.1절(관리 API)→Task 3~5, 5.2절(위젯 config)→Task 6, 7절(관리 화면)→Task 8~10, 6절(위젯)→Task 11, 8절(테스트)→Task 2·4·12, 9절(롤아웃)→Task 12. 누락 없음.

**미해결 항목 없음.** 초안에서 추측으로 남겼던 두 지점을 실제 코드로 확인해 채웠다:
- API 클라이언트는 `.get/.post` 가 없고 `apiClient.request<T>(path, { method, body })` 단일
  메서드다(`lib/api/client.ts:14`) → Task 9 코드를 그 형태로 교체
- 선택된 챗봇은 `useSelectedChatbot()` 훅으로 얻는다
  (`lib/admin-ui/use-selected-chatbot.ts`) → Task 10 코드를 훅 사용으로 교체

**타입 일관성:** `MenuNode`(프론트) ↔ `_to_dict()`(백엔드) 키 이름 일치 확인 — id/label/description/actionType/payload/url/sortOrder/isEnabled/children. `WidgetQuickAction` 은 백엔드·위젯 양쪽에 `parentId`/`description` 추가로 일치.
