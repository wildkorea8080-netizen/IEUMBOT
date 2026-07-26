"""add menu_permissions to admins

기관사용자(institution_user)의 메뉴별 접근 권한(JSON 배열).
institution_admin/super_admin에게는 무시(전체 접근). nullable 추가라 기존 계정 영향 없음.

Revision ID: 20260716_0045
Revises: 20260716_0044
Create Date: 2026-07-24 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0045"
down_revision: Union[str, None] = "20260716_0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("admins", sa.Column("menu_permissions", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("admins", "menu_permissions")
