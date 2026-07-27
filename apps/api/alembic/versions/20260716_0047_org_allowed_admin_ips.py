"""add allowed_admin_ips to organizations (IP access control)

관리자 콘솔 접근 IP 허용목록(IP/CIDR JSON 배열). NULL/빈 배열이면 제한 없음.
nullable 추가라 기존 기관에 영향 없음(전부 제한 없음 상태로 시작).

Revision ID: 20260716_0047
Revises: 20260716_0046
Create Date: 2026-07-27 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0047"
down_revision: Union[str, None] = "20260716_0046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("allowed_admin_ips", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "allowed_admin_ips")
