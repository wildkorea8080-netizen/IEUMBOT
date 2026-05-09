"""add user feedback columns to chat_messages

Revision ID: 20260509_0017
Revises: 20260507_0016
Create Date: 2026-05-09
"""

from alembic import op
import sqlalchemy as sa

revision = "20260509_0017"
down_revision = "20260507_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column("user_feedback", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "chat_messages",
        sa.Column("feedback_at", sa.DateTime(timezone=True), nullable=True),
    )
    # 빠른 조회용 인덱스 (피드백 있는 메시지만 필터링)
    op.create_index(
        "ix_chat_messages_user_feedback",
        "chat_messages",
        ["user_feedback"],
        postgresql_where=sa.text("user_feedback IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_user_feedback", table_name="chat_messages")
    op.drop_column("chat_messages", "feedback_at")
    op.drop_column("chat_messages", "user_feedback")
