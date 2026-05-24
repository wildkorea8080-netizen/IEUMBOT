"""faq category field

Revision ID: 20260524_0036
Revises: 20260524_0035
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = "20260524_0036"
down_revision = "20260524_0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "faq_items",
        sa.Column("category", sa.String(200), nullable=True, comment="대분류"),
    )
    op.add_column(
        "faq_items",
        sa.Column("field", sa.String(200), nullable=True, comment="소분류"),
    )


def downgrade() -> None:
    op.drop_column("faq_items", "field")
    op.drop_column("faq_items", "category")
