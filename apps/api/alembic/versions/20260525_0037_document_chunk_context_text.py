"""document_chunk context_text for Contextual Retrieval

Revision ID: 20260525_0037
Revises: 20260524_0036
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "20260525_0037"
down_revision = "20260524_0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "document_chunks",
        sa.Column("context_text", sa.Text(), nullable=True, comment="LLM-generated contextual summary (Contextual Retrieval)"),
    )


def downgrade() -> None:
    op.drop_column("document_chunks", "context_text")
