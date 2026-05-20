"""knowledge staging tables

Revision ID: 20260520_0031
Revises: 20260520_0030
Create Date: 2026-05-20

지식 사전 검토(스테이징) 세션 및 청크 테이블.
파일/텍스트 업로드 후 AI 분석 결과를 사용자가 검토하고 편집할 수 있는 대기 공간.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260520_0031"
down_revision = "20260520_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knowledge_staging_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "chatbot_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("chatbot_settings.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("source_name", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), server_default="ready", nullable=False),
        sa.Column("total_chunks", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "knowledge_staging_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("knowledge_staging_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("topic_title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("tags", postgresql.JSONB, server_default="[]", nullable=False),
        sa.Column("pii_detected", sa.Boolean, server_default="false", nullable=False),
        sa.Column("pii_regions", postgresql.JSONB, server_default="[]", nullable=False),
        sa.Column("merge_candidate_title", sa.String(500), nullable=True),
        sa.Column("merge_candidate_id", sa.String(100), nullable=True),
        sa.Column("merge_score", sa.Float, nullable=True),
        sa.Column("registration_type", sa.String(20), server_default="new", nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("knowledge_staging_chunks")
    op.drop_table("knowledge_staging_sessions")
