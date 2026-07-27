"""add session_token to admins (concurrent login prevention)

동일계정 동시접속 제한 — 마지막 로그인 세션 식별자(sid). 로그인 때마다 재발급되어
이전 세션 토큰을 무효화한다. NULL이면 미적용(하위호환)이라 기존 로그인 세션에
영향 없음(재로그인 시점부터 단일 세션 강제).

Revision ID: 20260716_0048
Revises: 20260716_0047
Create Date: 2026-07-27 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0048"
down_revision: str | None = "20260716_0047"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("admins", sa.Column("session_token", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("admins", "session_token")
