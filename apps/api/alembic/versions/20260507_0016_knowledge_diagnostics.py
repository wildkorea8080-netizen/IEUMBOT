"""add knowledge diagnostics columns

Revision ID: 20260507_0016
Revises: 20260427_0015
Create Date: 2026-05-07 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260507_0016"
down_revision: Union[str, None] = "20260427_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("document_versions", sa.Column("extracted_text_length", sa.Integer(), nullable=True, server_default=sa.text("0")))
    op.add_column("document_versions", sa.Column("chunk_count", sa.Integer(), nullable=True, server_default=sa.text("0")))
    op.add_column("document_versions", sa.Column("embedding_count", sa.Integer(), nullable=True, server_default=sa.text("0")))
    op.add_column("web_sources", sa.Column("extracted_text_length", sa.Integer(), nullable=True, server_default=sa.text("0")))
    op.add_column("web_sources", sa.Column("chunk_count", sa.Integer(), nullable=True, server_default=sa.text("0")))
    op.add_column("web_sources", sa.Column("embedding_count", sa.Integer(), nullable=True, server_default=sa.text("0")))
    op.add_column("web_sources", sa.Column("final_url", sa.Text(), nullable=True))
    op.add_column("web_sources", sa.Column("http_status_code", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE document_versions AS dv
        SET
            extracted_text_length = COALESCE(stats.text_length, 0),
            chunk_count = COALESCE(stats.chunk_count, 0),
            embedding_count = COALESCE(stats.embedding_count, 0)
        FROM (
            SELECT
                document_version_id,
                SUM(char_length(text_content)) AS text_length,
                COUNT(*) AS chunk_count,
                COUNT(embedding) AS embedding_count
            FROM document_chunks
            GROUP BY document_version_id
        ) AS stats
        WHERE stats.document_version_id = dv.id
        """
    )
    op.execute(
        """
        UPDATE web_sources
        SET
            final_url = COALESCE(metadata_json->>'final_url', base_url),
            extracted_text_length = CASE
                WHEN metadata_json->>'extracted_text_length' ~ '^[0-9]+$'
                THEN (metadata_json->>'extracted_text_length')::integer
                ELSE 0
            END,
            chunk_count = CASE
                WHEN metadata_json->>'indexed_chunk_count' ~ '^[0-9]+$'
                THEN (metadata_json->>'indexed_chunk_count')::integer
                ELSE 0
            END
        """
    )
    op.execute(
        """
        UPDATE web_sources AS ws
        SET
            extracted_text_length = COALESCE(stats.text_length, ws.extracted_text_length, 0),
            chunk_count = COALESCE(stats.chunk_count, ws.chunk_count, 0),
            embedding_count = COALESCE(stats.embedding_count, ws.embedding_count, 0)
        FROM (
            SELECT
                (d.metadata_json->>'web_source_id')::uuid AS web_source_id,
                SUM(char_length(c.text_content)) AS text_length,
                COUNT(*) AS chunk_count,
                COUNT(c.embedding) AS embedding_count
            FROM documents AS d
            JOIN document_chunks AS c ON c.document_id = d.id
            WHERE d.metadata_json->>'sourceType' = 'website'
              AND d.metadata_json->>'web_source_id' ~ '^[0-9a-fA-F-]{36}$'
            GROUP BY (d.metadata_json->>'web_source_id')::uuid
        ) AS stats
        WHERE stats.web_source_id = ws.id
        """
    )

    op.alter_column("document_versions", "extracted_text_length", server_default=None)
    op.alter_column("document_versions", "chunk_count", server_default=None)
    op.alter_column("document_versions", "embedding_count", server_default=None)
    op.alter_column("web_sources", "extracted_text_length", server_default=None)
    op.alter_column("web_sources", "chunk_count", server_default=None)
    op.alter_column("web_sources", "embedding_count", server_default=None)


def downgrade() -> None:
    op.drop_column("web_sources", "http_status_code")
    op.drop_column("web_sources", "final_url")
    op.drop_column("web_sources", "embedding_count")
    op.drop_column("web_sources", "chunk_count")
    op.drop_column("web_sources", "extracted_text_length")
    op.drop_column("document_versions", "embedding_count")
    op.drop_column("document_versions", "chunk_count")
    op.drop_column("document_versions", "extracted_text_length")
