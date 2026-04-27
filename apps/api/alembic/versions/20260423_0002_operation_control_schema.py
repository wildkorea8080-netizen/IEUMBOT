"""operation controlled chatbot schema

Revision ID: 20260423_0002
Revises: 20260423_0001
Create Date: 2026-04-23 00:20:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260423_0002"
down_revision: Union[str, None] = "20260423_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "answer_priority_policy",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text(
                "'[\"uploaded_document\",\"official_website_indexed\",\"official_notice\",\"external_web_exception\"]'::jsonb"
            ),
        ),
    )
    op.add_column("chatbot_settings", sa.Column("corpus_domain_policy", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("chatbot_settings", sa.Column("search_control_policy", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("chatbot_settings", sa.Column("answer_validation_policy", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("chatbot_settings", sa.Column("guardrail_policy", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("chatbot_settings", sa.Column("escalation_policy", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.alter_column("chatbot_settings", "answer_priority_policy", server_default=None)
    op.alter_column("chatbot_settings", "corpus_domain_policy", server_default=None)
    op.alter_column("chatbot_settings", "search_control_policy", server_default=None)
    op.alter_column("chatbot_settings", "answer_validation_policy", server_default=None)
    op.alter_column("chatbot_settings", "guardrail_policy", server_default=None)
    op.alter_column("chatbot_settings", "escalation_policy", server_default=None)

    op.add_column("documents", sa.Column("corpus_domain", sa.String(length=40), nullable=False, server_default="policy"))
    op.alter_column("documents", "corpus_domain", server_default=None)
    op.create_index("ix_documents_org_chatbot_corpus", "documents", ["organization_id", "chatbot_id", "corpus_domain"], unique=False)

    op.add_column("document_versions", sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("document_versions", sa.Column("source_type", sa.String(length=20), nullable=False, server_default="pdf"))
    op.add_column("document_versions", sa.Column("corpus_domain", sa.String(length=40), nullable=False, server_default="policy"))
    op.add_column("document_versions", sa.Column("effective_date", sa.Date(), nullable=True))
    op.add_column("document_versions", sa.Column("expiration_date", sa.Date(), nullable=True))
    op.add_column("document_versions", sa.Column("document_priority", sa.Integer(), nullable=False, server_default="100"))
    op.add_column("document_versions", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("document_versions", sa.Column("manual_boost", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("document_versions", sa.Column("is_search_suppressed", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("document_versions", sa.Column("manual_override_reason", sa.Text(), nullable=True))
    op.add_column("document_versions", sa.Column("issuing_department", sa.String(length=150), nullable=True))
    op.add_column("document_versions", sa.Column("audience", sa.Text(), nullable=True))
    op.add_column("document_versions", sa.Column("exceptions_text", sa.Text(), nullable=True))
    op.execute(
        """
        UPDATE document_versions dv
        SET chatbot_id = d.chatbot_id
        FROM documents d
        WHERE dv.document_id = d.id
        """
    )
    op.alter_column("document_versions", "chatbot_id", nullable=False)
    op.create_foreign_key(
        "fk_document_versions_chatbot_id_chatbot_settings",
        "document_versions",
        "chatbot_settings",
        ["chatbot_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_document_versions_org_chatbot_active",
        "document_versions",
        ["organization_id", "chatbot_id", "is_active"],
        unique=False,
    )
    op.create_index(
        "ix_document_versions_org_chatbot_source",
        "document_versions",
        ["organization_id", "chatbot_id", "source_type"],
        unique=False,
    )
    op.alter_column("document_versions", "source_type", server_default=None)
    op.alter_column("document_versions", "corpus_domain", server_default=None)
    op.alter_column("document_versions", "document_priority", server_default=None)
    op.alter_column("document_versions", "is_active", server_default=None)
    op.alter_column("document_versions", "manual_boost", server_default=None)
    op.alter_column("document_versions", "is_search_suppressed", server_default=None)

    op.add_column("document_chunks", sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("document_chunks", sa.Column("section_title", sa.Text(), nullable=True))
    op.add_column(
        "document_chunks",
        sa.Column("corpus_domain", sa.String(length=40), nullable=False, server_default="policy"),
    )
    op.execute(
        """
        UPDATE document_chunks dc
        SET chatbot_id = d.chatbot_id,
            corpus_domain = COALESCE(d.corpus_domain, 'policy')
        FROM documents d
        WHERE dc.document_id = d.id
        """
    )
    op.alter_column("document_chunks", "chatbot_id", nullable=False)
    op.create_foreign_key(
        "fk_document_chunks_chatbot_id_chatbot_settings",
        "document_chunks",
        "chatbot_settings",
        ["chatbot_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_document_chunks_org_chatbot_corpus",
        "document_chunks",
        ["organization_id", "chatbot_id", "corpus_domain"],
        unique=False,
    )
    op.alter_column("document_chunks", "corpus_domain", server_default=None)

    op.add_column("citations", sa.Column("source_type", sa.String(length=30), nullable=True))
    op.add_column("citations", sa.Column("section_title", sa.String(length=255), nullable=True))
    op.add_column("citations", sa.Column("retrieval_rank", sa.Integer(), nullable=True))
    op.add_column("citations", sa.Column("rerank_score", sa.Float(), nullable=True))
    op.add_column("citations", sa.Column("selection_reason", sa.Text(), nullable=True))

    op.add_column("chat_messages", sa.Column("classification_result", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("chat_messages", sa.Column("rewritten_query", sa.Text(), nullable=True))
    op.add_column("chat_messages", sa.Column("normalized_query", sa.Text(), nullable=True))
    op.add_column("chat_messages", sa.Column("query_decomposition", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("chat_messages", sa.Column("retrieved_documents", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("chat_messages", sa.Column("reranked_results", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("chat_messages", sa.Column("selected_sources", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("chat_messages", sa.Column("final_decision", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("chat_messages", sa.Column("result_type", sa.String(length=30), nullable=True))
    op.add_column("chat_messages", sa.Column("validation_signals", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("chat_messages", sa.Column("escalation_reason", sa.String(length=120), nullable=True))
    op.add_column("chat_messages", sa.Column("escalation_target_department", sa.String(length=120), nullable=True))
    op.add_column("chat_messages", sa.Column("escalation_target_queue", sa.String(length=120), nullable=True))
    op.create_index(
        "ix_chat_messages_org_chatbot_result_type",
        "chat_messages",
        ["organization_id", "chatbot_id", "result_type"],
        unique=False,
    )
    op.alter_column("chat_messages", "classification_result", server_default=None)
    op.alter_column("chat_messages", "query_decomposition", server_default=None)
    op.alter_column("chat_messages", "retrieved_documents", server_default=None)
    op.alter_column("chat_messages", "reranked_results", server_default=None)
    op.alter_column("chat_messages", "selected_sources", server_default=None)
    op.alter_column("chat_messages", "final_decision", server_default=None)
    op.alter_column("chat_messages", "validation_signals", server_default=None)

    op.create_table(
        "synonym_dictionary",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("canonical_term", sa.String(length=120), nullable=False),
        sa.Column("synonym_term", sa.String(length=120), nullable=False),
        sa.Column("is_bidirectional", sa.Boolean(), nullable=False),
        sa.Column("scope", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_settings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_synonym_dictionary")),
        sa.UniqueConstraint(
            "organization_id",
            "chatbot_id",
            "canonical_term",
            "synonym_term",
            name="uq_synonym_dictionary_org_chatbot_terms",
        ),
    )
    op.create_index(
        "ix_synonym_dictionary_org_chatbot_active",
        "synonym_dictionary",
        ["organization_id", "chatbot_id", "is_active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_synonym_dictionary_org_chatbot_active", table_name="synonym_dictionary")
    op.drop_table("synonym_dictionary")

    op.drop_index("ix_chat_messages_org_chatbot_result_type", table_name="chat_messages")
    op.drop_column("chat_messages", "escalation_target_queue")
    op.drop_column("chat_messages", "escalation_target_department")
    op.drop_column("chat_messages", "escalation_reason")
    op.drop_column("chat_messages", "validation_signals")
    op.drop_column("chat_messages", "result_type")
    op.drop_column("chat_messages", "final_decision")
    op.drop_column("chat_messages", "selected_sources")
    op.drop_column("chat_messages", "reranked_results")
    op.drop_column("chat_messages", "retrieved_documents")
    op.drop_column("chat_messages", "query_decomposition")
    op.drop_column("chat_messages", "normalized_query")
    op.drop_column("chat_messages", "rewritten_query")
    op.drop_column("chat_messages", "classification_result")

    op.drop_column("citations", "selection_reason")
    op.drop_column("citations", "rerank_score")
    op.drop_column("citations", "retrieval_rank")
    op.drop_column("citations", "section_title")
    op.drop_column("citations", "source_type")

    op.drop_index("ix_document_chunks_org_chatbot_corpus", table_name="document_chunks")
    op.drop_constraint("fk_document_chunks_chatbot_id_chatbot_settings", "document_chunks", type_="foreignkey")
    op.drop_column("document_chunks", "corpus_domain")
    op.drop_column("document_chunks", "section_title")
    op.drop_column("document_chunks", "chatbot_id")

    op.drop_index("ix_document_versions_org_chatbot_source", table_name="document_versions")
    op.drop_index("ix_document_versions_org_chatbot_active", table_name="document_versions")
    op.drop_constraint("fk_document_versions_chatbot_id_chatbot_settings", "document_versions", type_="foreignkey")
    op.drop_column("document_versions", "exceptions_text")
    op.drop_column("document_versions", "audience")
    op.drop_column("document_versions", "issuing_department")
    op.drop_column("document_versions", "manual_override_reason")
    op.drop_column("document_versions", "is_search_suppressed")
    op.drop_column("document_versions", "manual_boost")
    op.drop_column("document_versions", "is_active")
    op.drop_column("document_versions", "document_priority")
    op.drop_column("document_versions", "expiration_date")
    op.drop_column("document_versions", "effective_date")
    op.drop_column("document_versions", "corpus_domain")
    op.drop_column("document_versions", "source_type")
    op.drop_column("document_versions", "chatbot_id")

    op.drop_index("ix_documents_org_chatbot_corpus", table_name="documents")
    op.drop_column("documents", "corpus_domain")

    op.drop_column("chatbot_settings", "escalation_policy")
    op.drop_column("chatbot_settings", "guardrail_policy")
    op.drop_column("chatbot_settings", "answer_validation_policy")
    op.drop_column("chatbot_settings", "search_control_policy")
    op.drop_column("chatbot_settings", "corpus_domain_policy")
    op.drop_column("chatbot_settings", "answer_priority_policy")
