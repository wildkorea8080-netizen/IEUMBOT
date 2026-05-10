"""add quick_reply_hints to chatbot_settings

Revision ID: 20260509_0020
Revises: 20260509_0019
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260509_0020"
down_revision = "20260509_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "quick_reply_hints",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
            comment="미리 정의된 질문 힌트 버튼 목록 (최대 5개)",
        ),
    )


def downgrade() -> None:
    op.drop_column("chatbot_settings", "quick_reply_hints")
