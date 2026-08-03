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
from sqlalchemy.dialects import postgresql

revision: str = "20260803_0049"
down_revision: str | None = "20260716_0048"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "quick_actions",
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("quick_actions", sa.Column("description", sa.String(length=300), nullable=True))
    op.create_foreign_key(
        "fk_quick_actions_parent_id_quick_actions",
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
    op.drop_constraint(
        "fk_quick_actions_parent_id_quick_actions", "quick_actions", type_="foreignkey"
    )
    op.drop_column("quick_actions", "description")
    op.drop_column("quick_actions", "parent_id")
