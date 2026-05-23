"""staging duplicate flag + web_source_id in knowledge

Revision ID: 20260523_0034
Revises: 20260523_0033
Create Date: 2026-05-23
"""

from alembic import op
import sqlalchemy as sa

revision = "20260523_0034"
down_revision = "20260523_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "knowledge_staging_sessions",
        sa.Column(
            "is_duplicate_file",
            sa.Boolean(),
            nullable=False,
            server_default="false",
            comment="True이면 동일 파일명 기존 문서 존재 → RAG 재등록 없이 FAQ만 생성",
        ),
    )


def downgrade() -> None:
    op.drop_column("knowledge_staging_sessions", "is_duplicate_file")
