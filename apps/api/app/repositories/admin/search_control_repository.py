import uuid
from datetime import date
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    ChatbotSetting,
    Document,
    DocumentChunk,
    DocumentVersion,
    RetrievalControlRule,
    SynonymDictionary,
)


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
) -> list[tuple[DocumentChunk, Document, DocumentVersion]]:
    stmt = (
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
        stmt = stmt.where(DocumentChunk.corpus_domain.in_(corpus_domains))
    if source_types:
        stmt = stmt.where(DocumentVersion.source_type.in_(source_types))

    today = date.today()
    if not include_inactive:
        stmt = stmt.where(
            Document.status == "active",
            DocumentVersion.is_active.is_(True),
            DocumentVersion.is_search_suppressed.is_(False),
            or_(DocumentVersion.effective_date.is_(None), DocumentVersion.effective_date <= today),
            or_(DocumentVersion.expiration_date.is_(None), DocumentVersion.expiration_date >= today),
        )

    token_clauses = []
    for term in question_terms:
        pattern = f"%{term}%"
        token_clauses.append(func.lower(DocumentChunk.text_content).like(pattern))
        token_clauses.append(func.lower(func.coalesce(DocumentChunk.section_title, "")).like(pattern))
        token_clauses.append(func.lower(Document.title).like(pattern))
    if token_clauses:
        stmt = stmt.where(or_(*token_clauses))

    stmt = stmt.order_by(
        DocumentVersion.document_priority.asc(),
        DocumentVersion.version_number.desc(),
        DocumentChunk.chunk_order.asc(),
    ).limit(limit_count)

    return list(db.execute(stmt).all())
