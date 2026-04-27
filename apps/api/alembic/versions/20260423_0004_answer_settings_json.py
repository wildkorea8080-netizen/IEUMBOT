"""add answer settings json

Revision ID: 20260423_0004
Revises: 20260423_0003
Create Date: 2026-04-23 01:40:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260423_0004"
down_revision: Union[str, None] = "20260423_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "answer_settings_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.alter_column("chatbot_settings", "answer_settings_json", server_default=None)


def downgrade() -> None:
    op.drop_column("chatbot_settings", "answer_settings_json")
