"""auto enforcement models

Revision ID: 20260425_0013
Revises: 20260425_0012
Create Date: 2026-04-25 23:55:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260425_0013"
down_revision = "20260425_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auto_enforcement_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("policy_type", sa.String(length=40), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("threshold_percent", sa.Float(), nullable=True),
        sa.Column("error_window_minutes", sa.Integer(), nullable=True),
        sa.Column("error_count_threshold", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "auto_enforcement_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("widget_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("policy_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("previous_status", sa.String(length=40), nullable=True),
        sa.Column("new_status", sa.String(length=40), nullable=True),
        sa.Column("resolved_at", sa.String(), nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_settings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["widget_id"], ["widget_deployments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["policy_id"], ["auto_enforcement_policies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resolved_by"], ["admins.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auto_enforcement_logs_org_created", "auto_enforcement_logs", ["organization_id", "created_at"], unique=False)
    op.create_index("ix_auto_enforcement_logs_policy_resolved", "auto_enforcement_logs", ["policy_id", "resolved_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_auto_enforcement_logs_policy_resolved", table_name="auto_enforcement_logs")
    op.drop_index("ix_auto_enforcement_logs_org_created", table_name="auto_enforcement_logs")
    op.drop_table("auto_enforcement_logs")
    op.drop_table("auto_enforcement_policies")
