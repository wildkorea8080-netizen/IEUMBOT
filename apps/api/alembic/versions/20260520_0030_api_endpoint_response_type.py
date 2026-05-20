"""api_endpoints에 response_type, view_config, list_config 추가

Revision ID: 20260520_0030
Revises: 20260518_0029
Create Date: 2026-05-20

Planee 스타일 Tools API 응답 타입(text/view/list)을 지원하기 위한 컬럼 추가.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260520_0030"
down_revision = "20260518_0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_endpoints",
        sa.Column(
            "response_type",
            sa.String(20),
            server_default="text",
            nullable=False,
        ),
    )
    op.add_column(
        "api_endpoints",
        sa.Column("view_config", postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "api_endpoints",
        sa.Column("list_config", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("api_endpoints", "list_config")
    op.drop_column("api_endpoints", "view_config")
    op.drop_column("api_endpoints", "response_type")
