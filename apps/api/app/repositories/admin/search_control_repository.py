import uuid
from datetime import date
from typing import Any

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    ChatbotSetting,
    Document,
    DocumentChunk,
    DocumentVersion,
    RetrievalControlRule,
    SynonymDictionary,
)
from app.services.embedding_service import coerce_embedding_vector


def get_chatbot_in_scope(
    db: Session,
    organization_id: str,
    chatbot_id: str,
) -> ChatbotSetting | None:
    stmt = select(ChatbotSetting).where(
        ChatbotSetting.id == chatbot_id,
        ChatbotSetting.organization_id == organization_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def list_active_rules(
    db: Session,
    organization_id: str,
    chatbot_id: str,
) -> list[RetrievalControlRule]:
    stmt = (
        select(RetrievalControlRule)
        .where(
            RetrievalControlRule.organization_id == organization_id,
            RetrievalControlRule.chatbot_id == chatbot_id,
            RetrievalControlRule.is_active.is_(True),
        )
        .order_by(RetrievalControlRule.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def list_rules(
    db: Session,
    organization_id: str,
    chatbot_id: str,
) -> list[RetrievalControlRule]:
    stmt = (
        select(RetrievalControlRule)
        .where(
            RetrievalControlRule.organization_id == organization_id,
            RetrievalControlRule.chatbot_id == chatbot_id,
        )
        .order_by(RetrievalControlRule.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_rule(
    db: Session,
    organization_id: str,
    chatbot_id: str,
    rule_id: str,
) -> RetrievalControlRule | None:
    stmt = select(RetrievalControlRule).where(
        RetrievalControlRule.id == rule_id,
        RetrievalControlRule.organization_id == organization_id,
        RetrievalControlRule.chatbot_id == chatbot_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def create_rule(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    created_by_admin_id: str,
    rule_type: str,
    target_type: str,
    document_id: str | None,
    document_version_id: str | None,
    corpus_domain: str | None,
    source_type: str | None,
    query_pattern: str | None,
    boost_value: int | None,
    reason: str | None,
    is_active: bool,
    metadata_json: dict[str, Any] | None,
) -> RetrievalControlRule:
    row = RetrievalControlRule(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        created_by_admin_id=created_by_admin_id,
        rule_type=rule_type,
        target_type=target_type,
        document_id=uuid.UUID(document_id) if document_id else None,
        document_version_id=uuid.UUID(document_version_id) if document_version_id else None,
        corpus_domain=corpus_domain,
        source_type=source_type,
        query_pattern=query_pattern,
        boost_value=boost_value,
        reason=reason,
        is_active=is_active,
        metadata_json=metadata_json or {},
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def delete_rule(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    rule_id: str,
) -> int:
    stmt = delete(RetrievalControlRule).where(
        RetrievalControlRule.id == rule_id,
        RetrievalControlRule.organization_id == organization_id,
        RetrievalControlRule.chatbot_id == chatbot_id,
    )
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def list_active_synonyms(
    db: Session,
    organization_id: str,
    chatbot_id: str,
) -> list[SynonymDictionary]:
    stmt = (
        select(SynonymDictionary)
        .where(
            SynonymDictionary.organization_id == organization_id,
            or_(SynonymDictionary.chatbot_id == chatbot_id, SynonymDictionary.chatbot_id.is_(None)),
            SynonymDictionary.is_active.is_(True),
        )
        .order_by(SynonymDictionary.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def list_synonyms(
    db: Session,
    organization_id: str,
    chatbot_id: str,
) -> list[SynonymDictionary]:
    stmt = (
        select(SynonymDictionary)
        .where(
            SynonymDictionary.organization_id == organization_id,
            or_(SynonymDictionary.chatbot_id == chatbot_id, SynonymDictionary.chatbot_id.is_(None)),
        )
        .order_by(SynonymDictionary.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def create_synonym(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    canonical_term: str,
    synonym_term: str,
    is_bidirectional: bool,
    scope: str,
    notes: str | None,
    is_active: bool,
) -> SynonymDictionary:
    row = SynonymDictionary(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        canonical_term=canonical_term,
        synonym_term=synonym_term,
        is_bidirectional=is_bidirectional,
        scope=scope,
        notes=notes,
        is_active=is_active,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def get_synonym(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    synonym_id: str,
) -> SynonymDictionary | None:
    stmt = select(SynonymDictionary).where(
        SynonymDictionary.id == synonym_id,
        SynonymDictionary.organization_id == organization_id,
        or_(SynonymDictionary.chatbot_id == chatbot_id, SynonymDictionary.chatbot_id.is_(None)),
    )
    return db.execute(stmt).scalar_one_or_none()


def delete_synonym(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    synonym_id: str,
) -> int:
    stmt = delete(SynonymDictionary).where(
        SynonymDictionary.id == synonym_id,
        SynonymDictionary.organization_id == organization_id,
        SynonymDictionary.chatbot_id == chatbot_id,
    )
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def fetch_retrieval_candidates(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    question_terms: list[str],
    corpus_domains: list[str] | None,
    source_types: list[str] | None,
    include_inactive: bool,
    limit_count: int,
    query_embedding: list[float] | None = None,
) -> list[tuple[DocumentChunk, Document, DocumentVersion]]:
    base_stmt = (
        select(DocumentChunk, Document, DocumentVersion)
        .join(Document, DocumentChunk.document_id == Document.id)
        .join(DocumentVersion, DocumentChunk.document_version_id == DocumentVersion.id)
        .where(
            DocumentChunk.organization_id == organization_id,
            DocumentChunk.chatbot_id == chatbot_id,
            Document.organization_id == organization_id,
            Document.chatbot_id == chatbot_id,
            DocumentVersion.organization_id == organization_id,
            DocumentVersion.chatbot_id == chatbot_id,
        )
    )

    if corpus_domains:
        base_stmt = base_stmt.where(DocumentChunk.corpus_domain.in_(corpus_domains))
    if source_types:
        base_stmt = base_stmt.where(DocumentVersion.source_type.in_(source_types))

    today = date.today()
    if not include_inactive:
        base_stmt = base_stmt.where(
            Document.status == "active",
            DocumentVersion.status == "completed",
            DocumentVersion.is_active.is_(True),
            DocumentVersion.is_search_suppressed.is_(False),
            or_(DocumentVersion.effective_date.is_(None), DocumentVersion.effective_date <= today),
            or_(DocumentVersion.expiration_date.is_(None), DocumentVersion.expiration_date >= today),
        )

    or_clauses = []
    for term in question_terms:
        pattern = f"%{term}%"
        or_clauses.append(func.lower(DocumentChunk.text_content).like(pattern))
        or_clauses.append(func.lower(func.coalesce(DocumentChunk.section_title, "")).like(pattern))
        or_clauses.append(func.lower(Document.title).like(pattern))

    lexical_rows: list[tuple[DocumentChunk, Document, DocumentVersion]] = []

    if or_clauses:
        and_rows: list[tuple[DocumentChunk, Document, DocumentVersion]] = []
        if len(question_terms) >= 2:
            and_clauses = []
            for term in question_terms[:4]:
                pattern = f"%{term}%"
                and_clauses.append(func.lower(DocumentChunk.text_content).like(pattern))
            and_stmt = base_stmt.where(and_(*and_clauses)).order_by(
                DocumentVersion.document_priority.asc(),
                DocumentVersion.version_number.desc(),
                DocumentChunk.chunk_order.asc(),
            ).limit(max(1, limit_count // 2))
            try:
                and_rows = list(db.execute(and_stmt).fetchall())
            except Exception:
                and_rows = []

        or_stmt = base_stmt.where(or_(*or_clauses)).order_by(
            DocumentVersion.document_priority.asc(),
            DocumentVersion.version_number.desc(),
            DocumentChunk.chunk_order.asc(),
        ).limit(limit_count)
        or_rows = list(db.execute(or_stmt).fetchall())

        seen_lex: set[str] = set()
        combined_lex: list[tuple[DocumentChunk, Document, DocumentVersion]] = []
        for row in and_rows + or_rows:
            cid = str(row[0].id)
            if cid not in seen_lex:
                seen_lex.add(cid)
                combined_lex.append(row)
        lexical_rows = combined_lex

    vector_rows: list[tuple[DocumentChunk, Document, DocumentVersion]] = []
    normalized_query_embedding = coerce_embedding_vector(query_embedding)
    if normalized_query_embedding is not None:
        vector_stmt = (
            base_stmt.where(DocumentChunk.embedding.is_not(None))
            .order_by(
                DocumentChunk.embedding.cosine_distance(normalized_query_embedding),
                DocumentVersion.document_priority.asc(),
                DocumentVersion.version_number.desc(),
            )
            .limit(limit_count * 2)
        )
        vector_rows = list(db.execute(vector_stmt).fetchall())

    chunk_scores: dict[str, float] = {}
    chunk_rows: dict[str, tuple[DocumentChunk, Document, DocumentVersion]] = {}

    for rank, row in enumerate(lexical_rows):
        cid = str(row[0].id)
        keyword_rank_score = max(0.0, 1.0 - rank * 0.05)
        chunk_scores[cid] = chunk_scores.get(cid, 0.0) + keyword_rank_score * 0.4
        chunk_rows[cid] = row

    for rank, row in enumerate(vector_rows):
        cid = str(row[0].id)
        vector_rank_score = max(0.0, 1.0 - rank * 0.05)
        chunk_scores[cid] = chunk_scores.get(cid, 0.0) + vector_rank_score * 0.6
        chunk_rows[cid] = row

    keyword_ids = {str(row[0].id) for row in lexical_rows}
    vector_ids = {str(row[0].id) for row in vector_rows}
    both_ids = keyword_ids & vector_ids
    for cid in both_ids:
        chunk_scores[cid] = chunk_scores.get(cid, 0.0) + 0.1

    sorted_ids = sorted(
        chunk_scores.keys(),
        key=lambda cid: chunk_scores[cid],
        reverse=True,
    )[:limit_count]
    rows = [chunk_rows[cid] for cid in sorted_ids]

    if not rows:
        fallback_stmt = base_stmt.order_by(
            DocumentVersion.document_priority.asc(),
            DocumentVersion.version_number.desc(),
            DocumentChunk.chunk_order.asc(),
        ).limit(limit_count)
        rows = list(db.execute(fallback_stmt).all())

    return rows[:limit_count]
