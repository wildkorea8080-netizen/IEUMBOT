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


def list_children(db: Session, *, chatbot_id: str, parent_id: str) -> list[QuickAction]:
    """특정 대분류의 자식들.

    chatbot_id를 함께 거는 이유는 두 가지다 — 다른 기관 챗봇의 노드가 섞이지 않게 하고,
    인덱스 ix_quick_actions_chatbot_parent_order(chatbot_id, parent_id, sort_order)를
    선두 컬럼부터 탈 수 있게 한다.
    """
    stmt = (
        select(QuickAction)
        .where(
            QuickAction.chatbot_id == uuid.UUID(chatbot_id),
            QuickAction.parent_id == uuid.UUID(parent_id),
            QuickAction.is_deleted.is_(False),
        )
        .order_by(QuickAction.sort_order.asc())
    )
    return list(db.execute(stmt).scalars().all())


def insert_node(db: Session, *, node: QuickAction) -> QuickAction:
    db.add(node)
    db.flush()
    return node


def soft_delete_with_children(db: Session, *, node: QuickAction) -> int:
    """노드를 소프트 삭제. 대분류면 자식도 함께. 삭제된 개수 반환.

    이 테이블의 자기참조 FK는 ON DELETE CASCADE지만 하드 삭제를 하지 않으므로
    실제로 발동하지 않는다 — 자식 정리는 여기서 명시적으로 한다.
    """
    now = datetime.now(UTC)
    targets = [
        node,
        *list_children(db, chatbot_id=str(node.chatbot_id), parent_id=str(node.id)),
    ]
    for target in targets:
        target.is_deleted = True
        target.deleted_at = now
    db.flush()
    return len(targets)
