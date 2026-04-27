"""saas organization baseline reinforcement

Revision ID: 20260424_0007
Revises: 20260423_0006
Create Date: 2026-04-24 10:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260424_0007"
down_revision: Union[str, None] = "20260423_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("primary_domain", sa.String(length=255), nullable=True))
    op.add_column("organizations", sa.Column("contact_name", sa.String(length=120), nullable=True))
    op.add_column("organizations", sa.Column("contact_email", sa.String(length=255), nullable=True))
    op.add_column("organizations", sa.Column("contact_phone", sa.String(length=50), nullable=True))

    op.create_table(
        "contracts",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_name", sa.String(length=80), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("monthly_conversation_limit", sa.Integer(), nullable=True),
        sa.Column("document_limit", sa.Integer(), nullable=True),
        sa.Column("website_limit", sa.Integer(), nullable=True),
        sa.Column("chatbot_limit", sa.Integer(), nullable=True),
        sa.Column("widget_limit", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default=sa.text("'active'")),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contracts")),
    )
    op.create_index("ix_contracts_org_status", "contracts", ["organization_id", "status"], unique=False)
    op.create_index(
        "ix_contracts_org_date_range",
        "contracts",
        ["organization_id", "start_date", "end_date"],
        unique=False,
    )
    op.alter_column("contracts", "status", server_default=None)

    op.create_table(
        "widget_deployments",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("widget_key", sa.String(length=128), nullable=False),
        sa.Column(
            "allowed_domains",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("theme_color", sa.String(length=20), nullable=True),
        sa.Column("position", sa.String(length=30), nullable=False, server_default=sa.text("'bottom-right'")),
        sa.Column("launcher_label", sa.String(length=120), nullable=True),
        sa.Column("welcome_message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default=sa.text("'active'")),
        sa.Column("install_script", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_settings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_widget_deployments")),
    )
    op.create_index(
        "ix_widget_deployments_org_chatbot_status",
        "widget_deployments",
        ["organization_id", "chatbot_id", "status"],
        unique=False,
    )
    op.create_index("ix_widget_deployments_widget_key", "widget_deployments", ["widget_key"], unique=True)
    op.alter_column("widget_deployments", "allowed_domains", server_default=None)
    op.alter_column("widget_deployments", "position", server_default=None)
    op.alter_column("widget_deployments", "status", server_default=None)

    op.alter_column("admins", "organization_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.alter_column("admins", "role", existing_type=sa.String(length=30), server_default=sa.text("'institution_admin'"))
    op.execute("UPDATE admins SET role = 'institution_admin' WHERE role = 'admin'")
    op.execute("UPDATE admins SET organization_id = NULL WHERE role = 'super_admin'")
    op.create_check_constraint(
        "ck_admins_role_org_scope",
        "admins",
        "(role = 'super_admin' AND organization_id IS NULL) OR (role <> 'super_admin' AND organization_id IS NOT NULL)",
    )
    op.alter_column("admins", "role", server_default=None)

    # Backfill safety: old or partially-migrated data may have nullable organization_id.
    op.execute(
        """
        UPDATE documents AS d
        SET organization_id = cs.organization_id
        FROM chatbot_settings AS cs
        WHERE d.chatbot_id = cs.id
          AND d.organization_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE chat_sessions AS s
        SET organization_id = cs.organization_id
        FROM chatbot_settings AS cs
        WHERE s.chatbot_id = cs.id
          AND s.organization_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE chat_messages AS m
        SET organization_id = s.organization_id
        FROM chat_sessions AS s
        WHERE m.session_id = s.id
          AND m.organization_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE chat_messages AS m
        SET organization_id = cs.organization_id
        FROM chatbot_settings AS cs
        WHERE m.chatbot_id = cs.id
          AND m.organization_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("ck_admins_role_org_scope", "admins", type_="check")
    op.alter_column("admins", "role", existing_type=sa.String(length=30), server_default=sa.text("'admin'"))
    op.execute("UPDATE admins SET role = 'admin' WHERE role = 'institution_admin'")
    op.alter_column("admins", "role", server_default=None)
    op.alter_column("admins", "organization_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)

    op.drop_index("ix_widget_deployments_widget_key", table_name="widget_deployments")
    op.drop_index("ix_widget_deployments_org_chatbot_status", table_name="widget_deployments")
    op.drop_table("widget_deployments")

    op.drop_index("ix_contracts_org_date_range", table_name="contracts")
    op.drop_index("ix_contracts_org_status", table_name="contracts")
    op.drop_table("contracts")

    op.drop_column("organizations", "contact_phone")
    op.drop_column("organizations", "contact_email")
    op.drop_column("organizations", "contact_name")
    op.drop_column("organizations", "primary_domain")
