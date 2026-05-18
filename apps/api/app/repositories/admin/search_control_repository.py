import uuid
from datetime import date
from typing import Any

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    ChatbotSetting,
    Document,
    DocumentChunk,
    DocumentVersion,
    RetrievalControlRule,
    SynonymDictionary,
)
from app.services.embedding_service import coerce_embedding_vector

# USE_HYBRID_SEARCH=true 이면 BM25(tsvector) + RRF 활성화
# false(기본) 이면 기존 LIKE 방식 유지 (롤백 대비)
_USE_HYBRID_SEARCH: bool = settings.use_hybrid_search


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


def _build_base_stmt(
    *,
    organization_id: str,
    chatbot_id: str,
    corpus_domains: list[str] | None,
    source_types: list[str] | None,
    include_inactive: bool,
):
    """공통 JOIN + WHERE 조건을 가진 base statement를 생성."""
    today = date.today()
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
    if not include_inactive:
        stmt = stmt.where(
            Document.status == "active",
            DocumentVersion.status == "completed",
            DocumentVersion.is_active.is_(True),
            DocumentVersion.is_search_suppressed.is_(False),
            or_(DocumentVersion.effective_date.is_(None), DocumentVersion.effective_date <= today),
            or_(DocumentVersion.expiration_date.is_(None), DocumentVersion.expiration_date >= today),
        )
    return stmt


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
    """
    하이브리드 키워드(BM25 또는 LIKE) + 벡터 검색 후 RRF 예비 스코어로 후보를 반환.

    USE_HYBRID_SEARCH=true:
        text_search_vector 가 있는 청크 → BM25(ts_rank) 검색
        text_search_vector 가 NULL인 청크 → LIKE fallback 검색 (마이그레이션 이전 레코드)
        각 청크에 _bm25_rank, _vector_rank 속성을 부착해
        retrieval_precheck_service.py 에서 RRF 계산에 활용.

    USE_HYBRID_SEARCH=false (기본):
        기존 LIKE + 벡터 방식 그대로 동작.
    """
    base_stmt = _build_base_stmt(
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        corpus_domains=corpus_domains,
        source_types=source_types,
        include_inactive=include_inactive,
    )

    # ── 벡터 검색 (공통) ────────────────────────────────────────────────────
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

    # 벡터 순위를 청크에 부착 (RRF 계산용)
    for v_rank, row in enumerate(vector_rows):
        row[0]._vector_rank = v_rank  # type: ignore[attr-defined]

    # ── 키워드 검색 분기 ─────────────────────────────────────────────────────
    if _USE_HYBRID_SEARCH:
        lexical_rows = _fetch_bm25_candidates(
            db,
            base_stmt=base_stmt,
            question_terms=question_terms,
            limit_count=limit_count,
        )
    else:
        lexical_rows = _fetch_like_candidates(
            db,
            base_stmt=base_stmt,
            question_terms=question_terms,
            limit_count=limit_count,
        )

    # ── 예비 스코어 병합 (기존 로직 유지) ────────────────────────────────────
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
    for cid in keyword_ids & vector_ids:
        chunk_scores[cid] = chunk_scores.get(cid, 0.0) + 0.1

    sorted_ids = sorted(chunk_scores, key=lambda cid: chunk_scores[cid], reverse=True)[:limit_count]
    rows = [chunk_rows[cid] for cid in sorted_ids]

    if not rows:
        fallback_stmt = base_stmt.order_by(
            DocumentVersion.document_priority.asc(),
            DocumentVersion.version_number.desc(),
            DocumentChunk.chunk_order.asc(),
        ).limit(limit_count)
        rows = list(db.execute(fallback_stmt).all())

    return rows[:limit_count]


def _fetch_like_candidates(
    db: Session,
    *,
    base_stmt: Any,
    question_terms: list[str],
    limit_count: int,
) -> list[tuple[DocumentChunk, Document, DocumentVersion]]:
    """기존 LIKE 방식 키워드 검색 (fallback / hybrid=false 시 사용)."""
    or_clauses = []
    for term in question_terms:
        pattern = f"%{term}%"
        or_clauses.append(func.lower(DocumentChunk.text_content).like(pattern))
        or_clauses.append(func.lower(func.coalesce(DocumentChunk.section_title, "")).like(pattern))
        or_clauses.append(func.lower(Document.title).like(pattern))

    if not or_clauses:
        return []

    and_rows: list[tuple[DocumentChunk, Document, DocumentVersion]] = []
    if len(question_terms) >= 2:
        and_clauses = [
            func.lower(DocumentChunk.text_content).like(f"%{term}%")
            for term in question_terms[:4]
        ]
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

    seen: set[str] = set()
    result: list[tuple[DocumentChunk, Document, DocumentVersion]] = []
    for row in and_rows + or_rows:
        cid = str(row[0].id)
        if cid not in seen:
            seen.add(cid)
            result.append(row)
    return result


def _fetch_bm25_candidates(
    db: Session,
    *,
    base_stmt: Any,
    question_terms: list[str],
    limit_count: int,
) -> list[tuple[DocumentChunk, Document, DocumentVersion]]:
    """
    BM25(tsvector @@ plainto_tsquery) 검색.

    text_search_vector 가 NULL인 레코드(마이그레이션 이전 청크)는
    LIKE fallback 으로 보완한다.
    각 청크에 _bm25_rank 속성을 부착해 RRF 계산에 활용.
    """
    if not question_terms:
        return []

    query_text = " ".join(question_terms)

    # ── BM25 검색: text_search_vector IS NOT NULL ───────────────────────────
    tsquery_expr = func.plainto_tsquery("simple", query_text)
    bm25_stmt = (
        base_stmt.where(
            DocumentChunk.text_search_vector.is_not(None),
            DocumentChunk.text_search_vector.op("@@")(tsquery_expr),
        )
        .order_by(
            func.ts_rank(DocumentChunk.text_search_vector, tsquery_expr).desc(),
            DocumentVersion.document_priority.asc(),
            DocumentVersion.version_number.desc(),
        )
        .limit(limit_count)
    )
    try:
        bm25_rows: list[tuple[DocumentChunk, Document, DocumentVersion]] = list(
            db.execute(bm25_stmt).fetchall()
        )
    except Exception:
        # tsvector 컬럼이 아직 없으면 (마이그레이션 미실행) LIKE로 완전 fallback
        return _fetch_like_candidates(
            db, base_stmt=base_stmt, question_terms=question_terms, limit_count=limit_count
        )

    # BM25 순위 부착
    bm25_ids: set[str] = set()
    for b_rank, row in enumerate(bm25_rows):
        row[0]._bm25_rank = b_rank  # type: ignore[attr-defined]
        bm25_ids.add(str(row[0].id))

    # ── LIKE fallback: text_search_vector IS NULL ────────────────────────────
    # 마이그레이션 이전 레코드를 보완 (없으면 빈 리스트)
    fallback_rows: list[tuple[DocumentChunk, Document, DocumentVersion]] = []
    or_clauses = []
    for term in question_terms:
        pattern = f"%{term}%"
        or_clauses.append(func.lower(DocumentChunk.text_content).like(pattern))
        or_clauses.append(func.lower(func.coalesce(DocumentChunk.section_title, "")).like(pattern))
    if or_clauses:
        like_fallback_stmt = (
            base_stmt.where(
                DocumentChunk.text_search_vector.is_(None),
                or_(*or_clauses),
            )
            .order_by(
                DocumentVersion.document_priority.asc(),
                DocumentVersion.version_number.desc(),
                DocumentChunk.chunk_order.asc(),
            )
            .limit(max(1, limit_count // 2))
        )
        try:
            fallback_rows = list(db.execute(like_fallback_stmt).fetchall())
        except Exception:
            fallback_rows = []

    # fallback 결과 병합 (BM25 결과와 중복 제거)
    combined: list[tuple[DocumentChunk, Document, DocumentVersion]] = list(bm25_rows)
    for row in fallback_rows:
        if str(row[0].id) not in bm25_ids:
            # fallback 청크는 bm25_rank 없음 → retrieval_precheck에서 token match 방식 사용
            combined.append(row)

    return combined
