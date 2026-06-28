"""add_extracted_text_to_knowledge_staging_sessions

분석 실패/타임아웃 시 재분석(reanalyze)에서 재사용할 원본 텍스트 보관 컬럼.

Revision ID: 20260629_0038
Revises: 8e2c26368fb8
Create Date: 2026-06-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260629_0038"
down_revision: Union[str, None] = "8e2c26368fb8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_staging_sessions",
        sa.Column("extracted_text", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("knowledge_staging_sessions", "extracted_text")
