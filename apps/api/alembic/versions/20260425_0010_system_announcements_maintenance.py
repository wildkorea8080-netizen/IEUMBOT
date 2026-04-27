"""add system announcements and maintenance

Revision ID: 20260425_0010
Revises: 20260425_0009
Create Date: 2026-04-25 23:10:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260425_0010"
down_revision: str | None = "20260425_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "system_announcements",
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("target_scope", sa.String(length=20), nullable=False),
        sa.Column("target_organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["admins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_system_announcements_active_window",
        "system_announcements",
        ["is_active", "start_at", "end_at"],
        unique=False,
    )
    op.create_index(
        "ix_system_announcements_scope_org",
        "system_announcements",
        ["target_scope", "target_organization_id"],
        unique=False,
    )

    op.create_table(
        "system_maintenance",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("allowed_paths", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("allowed_roles", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_system_maintenance_active_window",
        "system_maintenance",
        ["is_active", "start_at", "end_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_system_maintenance_active_window", table_name="system_maintenance")
    op.drop_table("system_maintenance")

    op.drop_index("ix_system_announcements_scope_org", table_name="system_announcements")
    op.drop_index("ix_system_announcements_active_window", table_name="system_announcements")
    op.drop_table("system_announcements")
