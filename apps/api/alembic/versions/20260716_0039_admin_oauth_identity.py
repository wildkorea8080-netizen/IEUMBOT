"""add OAuth (SNS) identity support to admins

셀프서비스 SNS 가입/로그인용:
- password_hash를 nullable로(소셜 계정은 비밀번호 없음)
- auth_provider("local"|"google"|"kakao"|"naver") + oauth_subject(제공사 고유 id) 추가
- (auth_provider, oauth_subject) 유니크 — 소셜 신원당 계정 1개
  (oauth_subject NULL인 로컬 계정끼리는 Postgres가 NULL을 구분해 충돌 없음)

Revision ID: 20260716_0039
Revises: 20260629_0038
Create Date: 2026-07-16 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0039"
down_revision: Union[str, None] = "20260629_0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "admins",
        sa.Column(
            "auth_provider",
            sa.String(length=20),
            nullable=False,
            server_default="local",
        ),
    )
    op.add_column(
        "admins",
        sa.Column("oauth_subject", sa.String(length=255), nullable=True),
    )
    # 기존 계정은 모두 로컬 → 비번 보유. 신규 소셜 계정만 NULL 허용.
    op.alter_column("admins", "password_hash", existing_type=sa.String(length=255), nullable=True)
    op.create_unique_constraint(
        "uq_admins_oauth_identity", "admins", ["auth_provider", "oauth_subject"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_admins_oauth_identity", "admins", type_="unique")
    op.alter_column("admins", "password_hash", existing_type=sa.String(length=255), nullable=False)
    op.drop_column("admins", "oauth_subject")
    op.drop_column("admins", "auth_provider")
