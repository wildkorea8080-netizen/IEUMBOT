"""add context_entities to chat_sessions

Revision ID: 20260509_0018
Revises: 20260509_0017
Create Date: 2026-05-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260509_0018"
down_revision = "20260509_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_sessions",
        sa.Column(
            "context_entities",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="대화 중 추적된 엔티티: 사업명, 자격조건, 사용자 프로필 힌트",
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_sessions", "context_entities")
