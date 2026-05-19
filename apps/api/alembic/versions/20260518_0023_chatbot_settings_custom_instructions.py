"""add custom_instructions to chatbot_settings

Revision ID: 20260518_0023
Revises: 20260513_0022
Create Date: 2026-05-18

기관별 자유 형식 추가 지시문 컬럼 추가.
system prompt 마지막에 삽입되어 기관 특화 안내 지침을 LLM에 전달한다.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260518_0023"
down_revision = "20260513_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "custom_instructions",
            sa.Text(),
            nullable=False,
            server_default="",
            comment="기관별 자유 형식 추가 지시문 (system prompt 마지막에 삽입)",
        ),
    )


def downgrade() -> None:
    op.drop_column("chatbot_settings", "custom_instructions")
