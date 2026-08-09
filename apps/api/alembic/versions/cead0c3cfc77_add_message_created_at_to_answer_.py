"""add_message_created_at_to_answer_evaluations

Revision ID: cead0c3cfc77
Revises: 24d3cb059840
Create Date: 2026-08-09 22:16:11.045940

autogenerate가 knowledge_staging_* 테이블 drop, pgvector HNSW 인덱스 drop,
무관한 테이블들의 컬럼 코멘트/인덱스 변경까지 같이 만들어내서 전부 걷어내고
answer_evaluations.message_created_at 추가분만 손으로 남겼다(REVIEW: 프로젝트
규칙 — autogenerate 결과는 검토 후 커밋).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cead0c3cfc77'
down_revision: Union[str, None] = '24d3cb059840'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) NULL 허용으로 추가 — 기존 행이 있을 수 있어 NOT NULL로 바로 추가하면 실패한다.
    op.add_column(
        'answer_evaluations',
        sa.Column('message_created_at', sa.DateTime(timezone=True), nullable=True),
    )
    # 2) chat_messages.created_at으로 백필. message_id가 그 답변 메시지를 가리킨다.
    op.execute(
        """
        UPDATE answer_evaluations AS ae
        SET message_created_at = cm.created_at
        FROM chat_messages AS cm
        WHERE cm.id = ae.message_id
          AND ae.message_created_at IS NULL
        """
    )
    # 3) 백필 후 NOT NULL로 강화.
    op.alter_column(
        'answer_evaluations',
        'message_created_at',
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.create_index(
        'ix_answer_evaluations_org_message_time',
        'answer_evaluations',
        ['organization_id', 'message_created_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_answer_evaluations_org_message_time', table_name='answer_evaluations')
    op.drop_column('answer_evaluations', 'message_created_at')
