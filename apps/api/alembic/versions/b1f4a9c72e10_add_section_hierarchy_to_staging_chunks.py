"""add category/field to knowledge_staging_chunks

문서 헤딩 계층(제N장 > 소제목)을 FAQ 분류·세부분야로 넘기기 위한 컬럼.
기존 행은 NULL이고, 등록 시 예전처럼 tags[0]/tags[1]로 폴백한다.

Revision ID: b1f4a9c72e10
Revises: cead0c3cfc77
Create Date: 2026-08-11
"""

import sqlalchemy as sa
from alembic import op

revision = "b1f4a9c72e10"
down_revision = "cead0c3cfc77"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "knowledge_staging_chunks",
        sa.Column("category", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "knowledge_staging_chunks",
        sa.Column("field", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("knowledge_staging_chunks", "field")
    op.drop_column("knowledge_staging_chunks", "category")
