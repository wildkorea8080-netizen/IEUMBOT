"""create conditional_responses table

Revision ID: 20260518_0025
Revises: 20260518_0024
Create Date: 2026-05-18

조건별 CTA(링크/동영상/파일/연락처) 추가 응답 규칙을 저장한다.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260518_0025"
down_revision = "20260518_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conditional_responses",
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
        sa.Column(
            "trigger_keywords",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
            comment='["신청", "지원"] — OR 조건',
        ),
        sa.Column(
            "trigger_type",
            sa.String(20),
            nullable=False,
            server_default="both",
            comment="question / answer / both",
        ),
        sa.Column(
            "action_type",
            sa.String(20),
            nullable=False,
            comment="link / video / file / contact",
        ),
        sa.Column("action_label", sa.String(100), nullable=False),
        sa.Column("action_value", sa.Text(), nullable=False),
        sa.Column("action_description", sa.Text(), nullable=True),
        sa.Column(
            "is_enabled", sa.Boolean(), nullable=False, server_default="true"
        ),
        sa.Column(
            "priority",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="낮을수록 높은 우선순위",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_conditional_responses_org", "conditional_responses", ["organization_id"])
    op.create_index("ix_conditional_responses_chatbot", "conditional_responses", ["chatbot_id"])
    op.create_index(
        "ix_conditional_responses_chatbot_enabled",
        "conditional_responses",
        ["chatbot_id", "is_enabled", "priority"],
    )


def downgrade() -> None:
    op.drop_index("ix_conditional_responses_chatbot_enabled", table_name="conditional_responses")
    op.drop_index("ix_conditional_responses_chatbot", table_name="conditional_responses")
    op.drop_index("ix_conditional_responses_org", table_name="conditional_responses")
    op.drop_table("conditional_responses")
