"""add detected/admin doc type to knowledge_staging_sessions

2계층 문서 유형 판별 결과와 3계층 관리자 수정값을 나란히 기록한다.
기존 세션은 NULL이고, NULL이면 예전처럼 공통 경로로 처리된다.

Revision ID: c7a3e51d0f88
Revises: b1f4a9c72e10
Create Date: 2026-08-11
"""

import sqlalchemy as sa
from alembic import op

revision = "c7a3e51d0f88"
down_revision = "b1f4a9c72e10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "knowledge_staging_sessions",
        sa.Column("detected_doc_type", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "knowledge_staging_sessions",
        sa.Column("admin_doc_type", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "knowledge_staging_sessions",
        sa.Column("doc_type_reason", sa.String(length=300), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("knowledge_staging_sessions", "doc_type_reason")
    op.drop_column("knowledge_staging_sessions", "admin_doc_type")
    op.drop_column("knowledge_staging_sessions", "detected_doc_type")
