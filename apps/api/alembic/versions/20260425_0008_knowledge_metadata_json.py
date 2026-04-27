"""add knowledge metadata json columns

Revision ID: 20260425_0008
Revises: 20260424_0007
Create Date: 2026-04-25 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260425_0008"
down_revision = "20260424_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.add_column(
        "web_sources",
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.alter_column("documents", "metadata_json", server_default=None)
    op.alter_column("web_sources", "metadata_json", server_default=None)


def downgrade() -> None:
    op.drop_column("web_sources", "metadata_json")
    op.drop_column("documents", "metadata_json")
