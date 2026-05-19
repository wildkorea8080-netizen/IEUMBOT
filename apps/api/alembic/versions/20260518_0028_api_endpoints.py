"""create api_endpoints table

Revision ID: 20260518_0028
Revises: 20260518_0027
Create Date: 2026-05-18

외부 API 연동 설정을 저장한다.
키워드 기반으로 질문에 매칭되면 실시간 API를 호출해 RAG 답변에 보완 정보를 제공.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260518_0028"
down_revision = "20260518_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_endpoints",
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
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("endpoint_url", sa.Text(), nullable=False),
        sa.Column("method", sa.String(10), nullable=False, server_default="GET"),
        sa.Column(
            "headers",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "intent_keywords",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("response_path", sa.String(200), nullable=True),
        sa.Column("response_template", sa.Text(), nullable=True),
        sa.Column("cache_seconds", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_api_endpoints_org", "api_endpoints", ["organization_id"])
    op.create_index("ix_api_endpoints_chatbot", "api_endpoints", ["chatbot_id"])


def downgrade() -> None:
    op.drop_index("ix_api_endpoints_chatbot", table_name="api_endpoints")
    op.drop_index("ix_api_endpoints_org", table_name="api_endpoints")
    op.drop_table("api_endpoints")
