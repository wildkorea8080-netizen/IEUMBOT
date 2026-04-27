"""retrieval control rules

Revision ID: 20260423_0003
Revises: 20260423_0002
Create Date: 2026-04-23 01:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260423_0003"
down_revision: Union[str, None] = "20260423_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "retrieval_control_rules",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rule_type", sa.String(length=20), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("document_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("corpus_domain", sa.String(length=40), nullable=True),
        sa.Column("source_type", sa.String(length=20), nullable=True),
        sa.Column("query_pattern", sa.String(length=200), nullable=True),
        sa.Column("boost_value", sa.Integer(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_settings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_admin_id"], ["admins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_version_id"], ["document_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_retrieval_control_rules")),
    )
    op.create_index(
        "ix_retrieval_control_rules_org_chatbot_type_active",
        "retrieval_control_rules",
        ["organization_id", "chatbot_id", "rule_type", "is_active"],
        unique=False,
    )
    op.create_index(
        "ix_retrieval_control_rules_org_chatbot_target",
        "retrieval_control_rules",
        ["organization_id", "chatbot_id", "target_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_retrieval_control_rules_org_chatbot_target",
        table_name="retrieval_control_rules",
    )
    op.drop_index(
        "ix_retrieval_control_rules_org_chatbot_type_active",
        table_name="retrieval_control_rules",
    )
    op.drop_table("retrieval_control_rules")
