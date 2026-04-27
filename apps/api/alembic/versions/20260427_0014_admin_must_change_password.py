"""add must_change_password flag to admins

Revision ID: 20260427_0014
Revises: 20260425_0013
Create Date: 2026-04-27 13:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260427_0014"
down_revision: Union[str, None] = "20260425_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "admins",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.alter_column("admins", "must_change_password", server_default=None)


def downgrade() -> None:
    op.drop_column("admins", "must_change_password")
