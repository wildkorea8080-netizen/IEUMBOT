"""add password reset token columns to admins

비밀번호 찾기(재설정)용. 이메일 인증 토큰과 분리 — 둘이 동시에 진행될 수 있으므로.
nullable 추가라 기존 계정에 영향 없음.

Revision ID: 20260716_0042
Revises: 20260716_0041
Create Date: 2026-07-16 02:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0042"
down_revision: Union[str, None] = "20260716_0041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("admins", sa.Column("reset_token_hash", sa.String(length=128), nullable=True))
    op.add_column("admins", sa.Column("reset_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("admins", "reset_expires_at")
    op.drop_column("admins", "reset_token_hash")
