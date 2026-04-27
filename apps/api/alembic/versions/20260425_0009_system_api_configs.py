"""add system api configs and llm usage logs

Revision ID: 20260425_0009
Revises: 20260425_0008
Create Date: 2026-04-25 18:40:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260425_0009"
down_revision: str | None = "20260425_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "system_api_configs",
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("api_key_encrypted", sa.Text(), nullable=False),
        sa.Column("base_url", sa.String(length=1024), nullable=True),
        sa.Column("default_model", sa.String(length=120), nullable=True),
        sa.Column("embedding_model", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("monthly_budget_limit", sa.Numeric(12, 4), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_system_api_configs_active_default", "system_api_configs", ["is_active", "is_default"], unique=False)
    op.create_index("ix_system_api_configs_provider_active", "system_api_configs", ["provider", "is_active"], unique=False)
    op.create_index(
        "uq_system_api_configs_default_true",
        "system_api_configs",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )

    op.create_table(
        "llm_usage_logs",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("api_config_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("operation_type", sa.String(length=30), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_cost", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("error_code", sa.String(length=120), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_settings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["api_config_id"], ["system_api_configs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_llm_usage_logs_org_created", "llm_usage_logs", ["organization_id", "created_at"], unique=False)
    op.create_index("ix_llm_usage_logs_chatbot_created", "llm_usage_logs", ["chatbot_id", "created_at"], unique=False)
    op.create_index("ix_llm_usage_logs_config_created", "llm_usage_logs", ["api_config_id", "created_at"], unique=False)
    op.create_index("ix_llm_usage_logs_success_created", "llm_usage_logs", ["success", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_llm_usage_logs_success_created", table_name="llm_usage_logs")
    op.drop_index("ix_llm_usage_logs_config_created", table_name="llm_usage_logs")
    op.drop_index("ix_llm_usage_logs_chatbot_created", table_name="llm_usage_logs")
    op.drop_index("ix_llm_usage_logs_org_created", table_name="llm_usage_logs")
    op.drop_table("llm_usage_logs")

    op.drop_index("uq_system_api_configs_default_true", table_name="system_api_configs")
    op.drop_index("ix_system_api_configs_provider_active", table_name="system_api_configs")
    op.drop_index("ix_system_api_configs_active_default", table_name="system_api_configs")
    op.drop_table("system_api_configs")
