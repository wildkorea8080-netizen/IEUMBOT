"""add response_format_rules to chatbot_settings

Revision ID: 20260518_0029
Revises: 20260518_0028
Create Date: 2026-05-18

응답 형식 규칙(Tools API text/view/list)을 챗봇별로 저장한다.
키워드 매칭 → 구조화 응답 형식 선택.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260518_0029"
down_revision = "20260518_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "response_format_rules",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
            comment="응답 형식 규칙 [{keywords, format, more_link}]",
        ),
    )


def downgrade() -> None:
    op.drop_column("chatbot_settings", "response_format_rules")
