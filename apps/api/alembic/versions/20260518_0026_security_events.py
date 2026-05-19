"""create security_events table

Revision ID: 20260518_0026
Revises: 20260518_0025
Create Date: 2026-05-18

보안 이벤트(개인정보 노출/비정상 접근/부적절 발언/부정 감정)를 기록한다.
관리자 보안센터에서 기간별·유형별·심각도별로 조회 가능.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260518_0026"
down_revision = "20260518_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "security_events",
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
        sa.Column("session_id", sa.String(120), nullable=True),
        sa.Column(
            "event_type",
            sa.String(30),
            nullable=False,
            comment="privacy_exposure / abnormal_access / inappropriate / negative_emotion",
        ),
        sa.Column(
            "severity",
            sa.String(10),
            nullable=False,
            comment="low / medium / high",
        ),
        sa.Column("question_masked", sa.Text(), nullable=False),
        sa.Column(
            "detected_patterns",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("ai_response", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_security_events_org", "security_events", ["organization_id"])
    op.create_index("ix_security_events_chatbot", "security_events", ["chatbot_id"])
    op.create_index("ix_security_events_created", "security_events", ["created_at"])
    op.create_index(
        "ix_security_events_type_severity",
        "security_events",
        ["event_type", "severity"],
    )


def downgrade() -> None:
    op.drop_index("ix_security_events_type_severity", table_name="security_events")
    op.drop_index("ix_security_events_created", table_name="security_events")
    op.drop_index("ix_security_events_chatbot", table_name="security_events")
    op.drop_index("ix_security_events_org", table_name="security_events")
    op.drop_table("security_events")
