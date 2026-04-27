"""add guardrail rules

Revision ID: 20260423_0005
Revises: 20260423_0004
Create Date: 2026-04-23 02:20:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260423_0005"
down_revision: Union[str, None] = "20260423_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "guardrail_rules",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rule_type", sa.String(length=40), nullable=False),
        sa.Column("target_category", sa.String(length=80), nullable=True),
        sa.Column("match_mode", sa.String(length=30), nullable=False),
        sa.Column("match_value", sa.Text(), nullable=True),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("fallback_message", sa.Text(), nullable=True),
        sa.Column("escalation_message", sa.Text(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_settings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_admin_id"], ["admins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_guardrail_rules")),
    )
    op.create_index(
        "ix_guardrail_rules_org_chatbot_active_priority",
        "guardrail_rules",
        ["organization_id", "chatbot_id", "is_active", "priority"],
        unique=False,
    )
    op.create_index(
        "ix_guardrail_rules_org_chatbot_rule_type",
        "guardrail_rules",
        ["organization_id", "chatbot_id", "rule_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_guardrail_rules_org_chatbot_rule_type", table_name="guardrail_rules")
    op.drop_index("ix_guardrail_rules_org_chatbot_active_priority", table_name="guardrail_rules")
    op.drop_table("guardrail_rules")
