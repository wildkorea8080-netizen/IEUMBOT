"""create unanswered_logs table

Revision ID: 20260518_0024
Revises: 20260518_0023
Create Date: 2026-05-18

RAG 검색 실패 / 미답변 질문을 기록한다.
관리자 콘솔에서 조회·처리 상태 관리에 사용.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260518_0024"
down_revision = "20260518_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "unanswered_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chatbot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chatbot_settings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("search_score", sa.Float(), nullable=True),
        sa.Column("outcome", sa.String(30), nullable=False),
        sa.Column("session_id", sa.String(100), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
            comment="pending / resolved / ignored",
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_unanswered_logs_org", "unanswered_logs", ["organization_id"])
    op.create_index("ix_unanswered_logs_chatbot", "unanswered_logs", ["chatbot_id"])
    op.create_index(
        "ix_unanswered_logs_status_created",
        "unanswered_logs",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_unanswered_logs_status_created", table_name="unanswered_logs")
    op.drop_index("ix_unanswered_logs_chatbot", table_name="unanswered_logs")
    op.drop_index("ix_unanswered_logs_org", table_name="unanswered_logs")
    op.drop_table("unanswered_logs")
