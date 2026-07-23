"""add logo_url to organizations

기관 로고(관리자 콘솔 좌측 상단 노출)용. base64 data URL 또는 외부 URL 저장.
nullable 추가라 기존 기관에 영향 없음(미설정이면 기본 이음봇 마크 표시).

Revision ID: 20260716_0043
Revises: 20260716_0042
Create Date: 2026-07-23 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0043"
down_revision: Union[str, None] = "20260716_0042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("logo_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "logo_url")
