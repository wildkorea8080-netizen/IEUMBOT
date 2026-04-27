"""add billing plans and contract usage

Revision ID: 20260425_0011
Revises: 20260425_0010
Create Date: 2026-04-25 23:55:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260425_0011"
down_revision: str | None = "20260425_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("monthly_base_fee", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("included_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("price_per_1k_tokens", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("chatbot_limit", sa.Integer(), nullable=True),
        sa.Column("monthly_conversation_limit", sa.Integer(), nullable=True),
        sa.Column("overage_policy", sa.String(length=30), nullable=False, server_default="block"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column("contracts", sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("contracts", sa.Column("current_period_start", sa.Date(), nullable=True))
    op.add_column("contracts", sa.Column("current_period_end", sa.Date(), nullable=True))
    op.add_column("contracts", sa.Column("current_usage_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("contracts", sa.Column("current_usage_cost", sa.Numeric(12, 6), nullable=False, server_default="0"))
    op.add_column("contracts", sa.Column("is_over_limit", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("contracts", sa.Column("billing_status", sa.String(length=30), nullable=False, server_default="active"))
    op.create_foreign_key("fk_contracts_plan_id", "contracts", "plans", ["plan_id"], ["id"], ondelete="SET NULL")

    op.create_table(
        "billing_alerts",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("metric_key", sa.String(length=60), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("threshold_percent", sa.Float(), nullable=True),
        sa.Column("current_value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("limit_value", sa.Float(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_billing_alerts_org_created", "billing_alerts", ["organization_id", "created_at"], unique=False)
    op.create_index("ix_billing_alerts_contract_metric", "billing_alerts", ["contract_id", "metric_key", "level"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_billing_alerts_contract_metric", table_name="billing_alerts")
    op.drop_index("ix_billing_alerts_org_created", table_name="billing_alerts")
    op.drop_table("billing_alerts")

    op.drop_constraint("fk_contracts_plan_id", "contracts", type_="foreignkey")
    op.drop_column("contracts", "billing_status")
    op.drop_column("contracts", "is_over_limit")
    op.drop_column("contracts", "current_usage_cost")
    op.drop_column("contracts", "current_usage_tokens")
    op.drop_column("contracts", "current_period_end")
    op.drop_column("contracts", "current_period_start")
    op.drop_column("contracts", "plan_id")

    op.drop_table("plans")
