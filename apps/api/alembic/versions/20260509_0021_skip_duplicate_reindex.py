"""add skip_duplicate_file_reindex to chatbot_settings

Revision ID: 20260509_0021
Revises: 20260509_0020
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa

revision = "20260509_0021"
down_revision = "20260509_0020"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "skip_duplicate_file_reindex",
            sa.Boolean(),
            nullable=False,
            server_default="false",
            comment="동일 파일명 재업로드 시 재학습 건너뜀",
        ),
    )

def downgrade() -> None:
    op.drop_column("chatbot_settings", "skip_duplicate_file_reindex")
