"""create system_password_policy (global password policy)

슈퍼관리자가 설정하는 전역 비밀번호 정책(단일 행). 행이 없으면 서비스가 기본값 사용.
기본값은 현재 규칙과 동일(8자 + 대문자·숫자·특수)이라 기존 동작 변화 없음.

Revision ID: 20260716_0046
Revises: 20260716_0045
Create Date: 2026-07-26 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0046"
down_revision: Union[str, None] = "20260716_0045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "system_password_policy",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("min_length", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("require_uppercase", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("require_lowercase", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("require_digit", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("require_symbol", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("system_password_policy")
