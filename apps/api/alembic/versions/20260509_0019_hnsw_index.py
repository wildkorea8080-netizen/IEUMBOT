"""
Replace IVFFlat with HNSW index for better recall

Revision ID: 20260509_0019
Revises: 20260509_0018
Create Date: 2026-05-09
"""
from alembic import op

revision = "20260509_0019"
down_revision = "20260509_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    context = op.get_context()
    with context.autocommit_block():
        # 기존 IVFFlat 인덱스 제거
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "ix_document_chunks_embedding_ivfflat"
        )
        # HNSW 인덱스 생성
        # m=16: 연결 수 (정확도/속도 균형)
        # ef_construction=64: 인덱스 빌드 품질
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_document_chunks_embedding_hnsw "
            "ON document_chunks "
            "USING hnsw (embedding vector_cosine_ops) "
            "WITH (m = 16, ef_construction = 64)"
        )


def downgrade() -> None:
    context = op.get_context()
    with context.autocommit_block():
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "ix_document_chunks_embedding_hnsw"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_document_chunks_embedding_ivfflat "
            "ON document_chunks "
            "USING ivfflat (embedding vector_cosine_ops) "
            "WITH (lists = 100)"
        )
