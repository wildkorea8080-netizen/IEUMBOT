"""add email verification + terms consent to admins (셀프 회원가입)

이메일/비밀번호 셀프 회원가입용:
- email_verified_at: 인증 완료 시각(local 가입 계정은 인증 전 로그인 차단)
- verification_token_hash / verification_expires_at: 인증 링크 토큰(해시 저장)
- terms_agreed_at: 이용약관·개인정보처리방침 동의 시각(법적 기록)

모두 nullable 추가라 기존 계정에 영향 없음.

Revision ID: 20260716_0041
Revises: 20260716_0040
Create Date: 2026-07-16 01:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0041"
down_revision: Union[str, None] = "20260716_0040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("admins", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("admins", sa.Column("verification_token_hash", sa.String(length=128), nullable=True))
    op.add_column(
        "admins", sa.Column("verification_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("admins", sa.Column("terms_agreed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("admins", "terms_agreed_at")
    op.drop_column("admins", "verification_expires_at")
    op.drop_column("admins", "verification_token_hash")
    op.drop_column("admins", "email_verified_at")
