"""add_memo_youtube_url_to_faq_items

Revision ID: 8e2c26368fb8
Revises: 20260525_0037
Create Date: 2026-05-26 09:42:31.099162
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8e2c26368fb8"
down_revision: Union[str, None] = "20260525_0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("faq_items", sa.Column("memo", sa.Text(), nullable=True))
    op.add_column("faq_items", sa.Column("youtube_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("faq_items", "youtube_url")
    op.drop_column("faq_items", "memo")
