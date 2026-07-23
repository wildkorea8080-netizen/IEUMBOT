"""add chatbot_limit to organizations

기관별 챗봇 생성 개수 한도. 기본 1(server_default) — 기존 기관도 1로 백필된다.
슈퍼관리자가 기관별로 조정하며, 생성 게이트(check_chatbot_limit)가 이 값을 우선한다.

Revision ID: 20260716_0044
Revises: 20260716_0043
Create Date: 2026-07-23 01:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0044"
down_revision: Union[str, None] = "20260716_0043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("chatbot_limit", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("organizations", "chatbot_limit")
