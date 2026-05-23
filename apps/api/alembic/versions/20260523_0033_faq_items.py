"""faq_items 테이블 생성

Revision ID: 20260523_0033
Revises: 20260520_0032
Create Date: 2026-05-23

AI 분석 → 관리자 검토 → 등록한 FAQ Q&A 항목.
question 임베딩으로 시맨틱 검색 후 RAG보다 우선 답변.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260523_0033"
down_revision = "20260520_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "faq_items",
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
        sa.Column("question", sa.String(500), nullable=False),
        sa.Column("answer", sa.Text, nullable=False),
        sa.Column("tags", postgresql.JSONB, server_default="[]", nullable=False),
        sa.Column("source_staging_session_id", sa.String(100), nullable=True),
        sa.Column(
            "embedding",
            sa.Text,  # pgvector는 별도 DDL로 처리
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # embedding 컬럼을 vector(1536) 타입으로 변환
    try:
        op.execute("ALTER TABLE faq_items ALTER COLUMN embedding TYPE vector(1536) USING NULL")
        op.execute(
            "CREATE INDEX ix_faq_items_embedding ON faq_items "
            "USING hnsw (embedding vector_cosine_ops)"
        )
    except Exception:
        pass  # pgvector 미설치 환경 대응


def downgrade() -> None:
    op.drop_table("faq_items")
