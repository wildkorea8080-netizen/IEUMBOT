"""system_api_configs에 fast_model 컬럼 추가

Revision ID: 20260520_0032
Revises: 20260520_0031
Create Date: 2026-05-20

역할별 모델 분리:
  default_model → 품질 우선 (채팅 답변, FAQ)
  fast_model    → 속도 우선 (의도분류, 리랭킹, 쿼리리라이팅, 팔로우업)
"""

import sqlalchemy as sa
from alembic import op

revision = "20260520_0032"
down_revision = "20260520_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 이미 컬럼이 존재하면 스킵 (중복 실행 안전)
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='system_api_configs' AND column_name='fast_model'"
    ))
    if result.fetchone() is None:
        op.add_column(
            "system_api_configs",
            sa.Column("fast_model", sa.String(120), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='system_api_configs' AND column_name='fast_model'"
    ))
    if result.fetchone() is not None:
        op.drop_column("system_api_configs", "fast_model")
