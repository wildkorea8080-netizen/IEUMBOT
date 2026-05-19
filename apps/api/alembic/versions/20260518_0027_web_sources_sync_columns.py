"""add sync columns to web_sources

Revision ID: 20260518_0027
Revises: 20260518_0026
Create Date: 2026-05-18

URL 지식 자동 동기화를 위한 컬럼 추가.
web_sources 테이블은 이미 last_synced_at / sync_mode 를 보유 중이므로
신규 컬럼만 추가한다.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260518_0027"
down_revision = "20260518_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "web_sources",
        sa.Column("sync_interval_days", sa.Integer(), nullable=True,
                  comment="자동 동기화 주기(일), null=비활성"),
    )
    op.add_column(
        "web_sources",
        sa.Column("next_sync_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "web_sources",
        sa.Column(
            "sync_enabled", sa.Boolean(), nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "web_sources",
        sa.Column("source_hash", sa.String(64), nullable=True,
                  comment="이전 크롤링 콘텐츠 해시"),
    )
    op.create_index(
        "ix_web_sources_next_sync",
        "web_sources",
        ["next_sync_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_web_sources_next_sync", table_name="web_sources")
    op.drop_column("web_sources", "source_hash")
    op.drop_column("web_sources", "sync_enabled")
    op.drop_column("web_sources", "next_sync_at")
    op.drop_column("web_sources", "sync_interval_days")
