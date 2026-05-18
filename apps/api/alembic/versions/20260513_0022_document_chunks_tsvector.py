"""add text_search_vector to document_chunks for BM25 hybrid search

Revision ID: 20260513_0022
Revises: 20260509_0021
Create Date: 2026-05-13

text_content 와 section_title 을 결합한 TSVECTOR 컬럼을 추가하고
GIN 인덱스를 생성한다. 기존 레코드는 일괄 갱신.
새 청크 INSERT 시에는 knowledge_service.py 에서 to_tsvector() 를 계산해 저장.
"""

from alembic import op

revision = "20260513_0022"
down_revision = "20260509_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. TSVECTOR 컬럼 추가
    op.execute(
        "ALTER TABLE document_chunks "
        "ADD COLUMN IF NOT EXISTS text_search_vector TSVECTOR"
    )

    # 2. GIN 인덱스 생성 (tsvector 전문검색 필수)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_doc_chunks_tsv "
        "ON document_chunks USING GIN(text_search_vector)"
    )

    # 3. 기존 레코드 일괄 갱신
    #    section_title 이 NULL 이면 빈 문자열로 처리
    op.execute(
        """
        UPDATE document_chunks
        SET text_search_vector = to_tsvector(
            'simple',
            COALESCE(section_title, '') || ' ' || COALESCE(text_content, '')
        )
        WHERE text_search_vector IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_doc_chunks_tsv")
    op.execute(
        "ALTER TABLE document_chunks "
        "DROP COLUMN IF EXISTS text_search_vector"
    )
