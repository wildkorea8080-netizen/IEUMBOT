"""add product_inquiries (도입 문의/리드)

셀프 가입 대신 영업 기반 온보딩: 공개 폼으로 담당자 연락처를 받아
슈퍼관리자가 컨택 후 조직/계정을 발급한다.

Revision ID: 20260716_0040
Revises: 20260716_0039
Create Date: 2026-07-16 00:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260716_0040"
down_revision: Union[str, None] = "20260716_0039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_inquiries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_name", sa.String(length=200), nullable=False),
        sa.Column("contact_name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=False),
        sa.Column("interest", sa.String(length=120), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("handled_note", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=60), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_product_inquiries_status_created",
        "product_inquiries",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_product_inquiries_status_created", table_name="product_inquiries")
    op.drop_table("product_inquiries")
