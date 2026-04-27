"""add end users table

Revision ID: 20260427_0015
Revises: 20260427_0014
Create Date: 2026-04-27 15:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260427_0015"
down_revision: Union[str, None] = "20260427_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False, server_default=sa.text("'user'")),
        sa.Column("status", sa.String(length=30), nullable=False, server_default=sa.text("'active'")),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_org_status", "users", ["organization_id", "status"], unique=False)
    op.create_index("ix_users_org_role", "users", ["organization_id", "role"], unique=False)
    op.alter_column("users", "role", server_default=None)
    op.alter_column("users", "status", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_users_org_role", table_name="users")
    op.drop_index("ix_users_org_status", table_name="users")
    op.drop_table("users")
