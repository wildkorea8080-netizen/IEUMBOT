"""staging merge original content

Revision ID: 20260524_0035
Revises: 20260523_0034
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = "20260524_0035"
down_revision = "20260523_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "knowledge_staging_chunks",
        sa.Column("merge_original_content", sa.Text(), nullable=True,
                  comment="병합 대상 기존 지식의 원본 텍스트 (diff 표시용)"),
    )


def downgrade() -> None:
    op.drop_column("knowledge_staging_chunks", "merge_original_content")
