import re
import uuid
from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.models import Document, DocumentChunk, DocumentVersion, RetrievalControlRule, SynonymDictionary
from app.repositories.admin.search_control_repository import (
    create_rule,
    create_synonym,
    delete_rule,
    delete_synonym,
    fetch_retrieval_candidates,
    get_rule,
    get_synonym,
    list_active_rules,
    list_active_synonyms,
    list_rules,
    list_synonyms,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.services.admin.scope_service import ensure_chatbot_in_scope, require_institution_organization_id
from app.schemas.admin_search import (
    AdminSearchTestRequest,
    AdminSearchTestResponse,
    AdminSearchTestTrace,
    BoostRuleCreateRequest,
    ExcludeRuleCreateRequest,
    PinRuleCreateRequest,
    RetrievalExplanation,
    RuleEffectSummary,
    SearchRuleResponse,
    SearchRuleUpdateRequest,
    SearchRulesListResponse,
    SearchTestCandidate,
    SynonymCreateRequest,
    SynonymResponse,
    SynonymUpdateRequest,
)

TOKEN_SPLIT_REGEX = re.compile(r"[^0-9A-Za-z가-힣]+")


def _normalize_query(question: str) -> str:
    normalized = " ".join(question.strip().split())
    return normalized.lower()


def _tokenize(question: str) -> list[str]:
    return [token for token in TOKEN_SPLIT_REGEX.split(question.lower()) if token]


def _expand_tokens(tokens: list[str], synonyms: list[SynonymDictionary]) -> list[str]:
    expanded: set[str] = set(tokens)
    for token in tokens:
        for row in synonyms:
            canonical = row.canonical_term.strip().lower()
            synonym = row.synonym_term.strip().lower()
            if token == canonical:
                expanded.add(synonym)
            if row.is_bidirectional and token == synonym:
                expanded.add(canonical)
    return sorted(expanded)


def _corpus_weight(corpus_domain: str, corpus_domain_policy: dict[str, Any]) -> float:
    if not isinstance(corpus_domain_policy, dict):
        return 0.0
    weights = corpus_domain_policy.get("weights")
    if isinstance(weights, dict):
        return float(weights.get(corpus_domain, 0.0))
    return float(corpus_domain_policy.get(corpus_domain, 0.0))


def _source_type_weight(source_type: str, search_control_policy: dict[str, Any]) -> float:
    if not isinstance(search_control_policy, dict):
        return 0.0
    weights = search_control_policy.get("sourceTypeWeights")
    if isinstance(weights, dict):
        return float(weights.get(source_type, 0.0))
    return 0.0


def _matches_rule_target(
    rule: RetrievalControlRule,
    *,
    query: str,
    document: Document,
    document_version: DocumentVersion,
    chunk: DocumentChunk,
) -> bool:
    if rule.target_type == "document":
        return bool(rule.document_id and rule.document_id == document.id)
    if rule.target_type == "documentVersion":
        return bool(rule.document_version_id and rule.document_version_id == document_version.id)
    if rule.target_type == "corpus":
        return bool(rule.corpus_domain and rule.corpus_domain == chunk.corpus_domain)
    if rule.target_type == "sourceType":
        return bool(rule.source_type and rule.source_type == document_version.source_type)
    if rule.target_type == "query":
        return bool(rule.query_pattern and rule.query_pattern.lower() in query)
    return False


def _to_rule_response(rule: RetrievalControlRule) -> SearchRuleResponse:
    return SearchRuleResponse(
        id=str(rule.id),
        chatbot_id=str(rule.chatbot_id),
        rule_type=rule.rule_type,
        target_type=rule.target_type,
        document_id=str(rule.document_id) if rule.document_id else None,
        document_version_id=str(rule.document_version_id) if rule.document_version_id else None,
        corpus_domain=rule.corpus_domain,
        source_type=rule.source_type,
        query_pattern=rule.query_pattern,
        boost_value=rule.boost_value,
        reason=rule.reason,
        is_active=rule.is_active,
        metadata_json=rule.metadata_json or {},
        created_at=rule.created_at.isoformat(),
        updated_at=rule.updated_at.isoformat(),
    )


def _to_synonym_response(row: SynonymDictionary) -> SynonymResponse:
    return SynonymResponse(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id) if row.chatbot_id else None,
        canonical_term=row.canonical_term,
        synonym_term=row.synonym_term,
        is_bidirectional=row.is_bidirectional,
        scope=row.scope,
        notes=row.notes,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def run_admin_search_test(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: AdminSearchTestRequest,
) -> AdminSearchTestResponse:
    organization_id = require_institution_organization_id(principal)
    chatbot = ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    normalized_question = _normalize_query(body.question)
    raw_tokens = _tokenize(normalized_question)
    synonyms = list_active_synonyms(db, organization_id, chatbot_id)
    expanded_terms = _expand_tokens(raw_tokens, synonyms)

    rules = list_active_rules(db, organization_id, chatbot_id)
    exclude_rules = [rule for rule in rules if rule.rule_type == "exclude"]
    boost_rules = [rule for rule in rules if rule.rule_type == "boost"]
    pin_rules = [rule for rule in rules if rule.rule_type == "pin"]

    rows = fetch_retrieval_candidates(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        question_terms=expanded_terms,
        corpus_domains=body.corpus_domains,
        source_types=body.source_types,
        include_inactive=body.include_inactive,
        limit_count=max(50, body.top_k * 8),
    )

    today = date.today()
    candidates: list[dict[str, Any]] = []
    excluded_count = 0

    for chunk, document, version in rows:
        matched_exclude_rules = [
            rule
            for rule in exclude_rules
            if _matches_rule_target(
                rule,
                query=normalized_question,
                document=document,
                document_version=version,
                chunk=chunk,
            )
        ]
        if matched_exclude_rules:
            excluded_count += 1
            continue

        matched_keywords = [
            term
            for term in expanded_terms
            if term in (chunk.text_content or "").lower()
            or term in (chunk.section_title or "").lower()
            or term in (document.title or "").lower()
        ]
        keyword_score = round(len(matched_keywords) / max(len(expanded_terms), 1), 4)

        vector_score = 0.0
        semantic_summary = "벡터 점수 미연동(향후 임베딩 질의 연동 지점)"

        corpus_signal = _corpus_weight(chunk.corpus_domain, chatbot.corpus_domain_policy or {})
        source_signal = _source_type_weight(version.source_type, chatbot.search_control_policy or {})
        version_signal = round(
            max(0.0, (200.0 - float(version.document_priority)) / 200.0)
            + max(0.0, min(version.version_number / 100.0, 0.2)),
            4,
        )

        recency_signal = 0.0
        if version.effective_date and version.effective_date <= today:
            recency_signal += 0.05
        if version.expiration_date and version.expiration_date < today:
            recency_signal -= 0.1
        recency_signal = round(recency_signal, 4)

        matched_boost_rules = [
            rule
            for rule in boost_rules
            if _matches_rule_target(
                rule,
                query=normalized_question,
                document=document,
                document_version=version,
                chunk=chunk,
            )
        ]
        manual_boost_value = sum((rule.boost_value or 0) for rule in matched_boost_rules) + int(
            version.manual_boost or 0
        )
        manual_boost_signal = round(min(manual_boost_value / 100.0, 1.0), 4)

        matched_pin_rules = [
            rule
            for rule in pin_rules
            if _matches_rule_target(
                rule,
                query=normalized_question,
                document=document,
                document_version=version,
                chunk=chunk,
            )
        ]
        is_pinned = bool(matched_pin_rules)

        combined_score = round(
            (keyword_score * 0.6)
            + (vector_score * 0.2)
            + (corpus_signal * 0.05)
            + (source_signal * 0.05)
            + (version_signal * 0.1)
            + recency_signal
            + manual_boost_signal,
            4,
        )

        explanation = RetrievalExplanation(
            matched_keywords=matched_keywords,
            semantic_relevance={
                "vectorScore": vector_score,
                "summary": semantic_summary,
            },
            corpus_priority_applied={
                "corpusDomain": chunk.corpus_domain,
                "weight": corpus_signal,
                "applied": corpus_signal != 0.0,
            },
            document_version_priority_applied={
                "documentPriority": version.document_priority,
                "versionNumber": version.version_number,
                "signal": version_signal,
                "applied": True,
            },
            recency_effective_date_signal_applied={
                "effectiveDate": version.effective_date.isoformat() if version.effective_date else None,
                "expirationDate": version.expiration_date.isoformat() if version.expiration_date else None,
                "signal": recency_signal,
                "applied": recency_signal != 0.0,
            },
            manual_rule_applied=RuleEffectSummary(
                excluded=False,
                boosted=manual_boost_value > 0,
                pinned=is_pinned,
                boost_value=manual_boost_value,
                reason=", ".join(
                    [rule.reason for rule in matched_boost_rules + matched_pin_rules if rule.reason]
                )
                or None,
            ),
        )

        candidates.append(
            {
                "isPinned": is_pinned,
                "combinedScore": combined_score,
                "candidate": SearchTestCandidate(
                    document_id=str(document.id),
                    document_name=document.title,
                    document_version_id=str(version.id),
                    version_label=f"v{version.version_number}",
                    page_number=chunk.page_number,
                    section_title=chunk.section_title,
                    corpus_domain=chunk.corpus_domain,
                    source_type=version.source_type,
                    effective_date=version.effective_date.isoformat() if version.effective_date else None,
                    expiration_date=version.expiration_date.isoformat() if version.expiration_date else None,
                    keyword_score=keyword_score,
                    vector_score=vector_score,
                    combined_score=combined_score,
                    final_rank=0,
                    selected_by_rules={
                        "pinned": is_pinned,
                        "pinRuleIds": [str(rule.id) for rule in matched_pin_rules],
                    },
                    exclusion_or_boost_applied={
                        "boostRuleIds": [str(rule.id) for rule in matched_boost_rules],
                        "manualBoost": int(version.manual_boost or 0),
                        "isSearchSuppressed": version.is_search_suppressed,
                    },
                    explanation=explanation,
                ),
            }
        )

    ranked = sorted(
        candidates,
        key=lambda item: (
            0 if item["isPinned"] else 1,
            -item["combinedScore"],
        ),
    )[: body.top_k]

    ranking_order = []
    for idx, item in enumerate(ranked, start=1):
        item["candidate"].final_rank = idx
        ranking_order.append(
            {
                "rank": idx,
                "documentId": item["candidate"].document_id,
                "documentVersionId": item["candidate"].document_version_id,
                "combinedScore": item["candidate"].combined_score,
                "isPinned": item["isPinned"],
            }
        )

    request_id = f"search_test_{uuid.uuid4().hex[:16]}"
    trace = AdminSearchTestTrace(
        original_question=body.question,
        normalized_question=normalized_question,
        expanded_terms=expanded_terms,
        applied_filters={
            "corpusDomains": body.corpus_domains or [],
            "sourceTypes": body.source_types or [],
            "topK": body.top_k,
            "includeInactive": body.include_inactive,
        },
        applied_rules={
            "excludeRuleIds": [str(rule.id) for rule in exclude_rules],
            "boostRuleIds": [str(rule.id) for rule in boost_rules],
            "pinRuleIds": [str(rule.id) for rule in pin_rules],
            "excludedCount": excluded_count,
        },
        ranking_order=ranking_order,
    )

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.search_test",
        target_type="chatbot",
        target_id=chatbot_id,
        result="success",
        request_id=request_id,
        metadata_json={
            "trace": trace.model_dump(by_alias=True),
            "candidateCount": len(ranked),
            "resultType": "retrieval_test",
        },
    )
    db.commit()

    return AdminSearchTestResponse(
        request_id=request_id,
        chatbot_id=chatbot_id,
        candidates=[item["candidate"] for item in ranked],
        trace=trace,
    )


def create_exclude_rule(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: ExcludeRuleCreateRequest,
) -> SearchRuleResponse:
    return _create_rule_common(
        db=db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_type="exclude",
        target_type=body.target_type,
        document_id=body.document_id,
        document_version_id=body.document_version_id,
        corpus_domain=body.corpus_domain,
        source_type=body.source_type,
        query_pattern=body.query_pattern,
        boost_value=None,
        reason=body.reason,
        is_active=body.is_active,
        metadata_json=body.metadata_json,
    )


def create_boost_rule(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: BoostRuleCreateRequest,
) -> SearchRuleResponse:
    return _create_rule_common(
        db=db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_type="boost",
        target_type=body.target_type,
        document_id=body.document_id,
        document_version_id=body.document_version_id,
        corpus_domain=body.corpus_domain,
        source_type=body.source_type,
        query_pattern=body.query_pattern,
        boost_value=body.boost_value,
        reason=body.reason,
        is_active=body.is_active,
        metadata_json=body.metadata_json,
    )


def create_pin_rule(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: PinRuleCreateRequest,
) -> SearchRuleResponse:
    return _create_rule_common(
        db=db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_type="pin",
        target_type=body.target_type,
        document_id=body.document_id,
        document_version_id=body.document_version_id,
        corpus_domain=body.corpus_domain,
        source_type=body.source_type,
        query_pattern=body.query_pattern,
        boost_value=None,
        reason=body.reason,
        is_active=body.is_active,
        metadata_json=body.metadata_json,
    )


def _create_rule_common(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
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
) -> SearchRuleResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    if document_id:
        try:
            uuid.UUID(document_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="INVALID_DOCUMENT_ID",
            ) from exc
    if document_version_id:
        try:
            uuid.UUID(document_version_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="INVALID_DOCUMENT_VERSION_ID",
            ) from exc

    row = create_rule(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        created_by_admin_id=principal.admin_id,
        rule_type=rule_type,
        target_type=target_type,
        document_id=document_id,
        document_version_id=document_version_id,
        corpus_domain=corpus_domain,
        source_type=source_type,
        query_pattern=query_pattern,
        boost_value=boost_value,
        reason=reason,
        is_active=is_active,
        metadata_json=metadata_json,
    )
    db.commit()
    db.refresh(row)
    return _to_rule_response(row)


def list_search_rules(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> SearchRulesListResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    rules = list_rules(db, organization_id, chatbot_id)
    synonyms = list_synonyms(db, organization_id, chatbot_id)
    return SearchRulesListResponse(
        rules=[_to_rule_response(row) for row in rules],
        synonyms=[_to_synonym_response(row) for row in synonyms],
    )


def update_search_rule(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    rule_id: str,
    body: SearchRuleUpdateRequest,
) -> SearchRuleResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    row = get_rule(db, organization_id, chatbot_id, rule_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SEARCH_RULE_NOT_FOUND")

    if body.is_active is not None:
        row.is_active = body.is_active
    if body.reason is not None:
        row.reason = body.reason
    if body.boost_value is not None:
        row.boost_value = body.boost_value
    if body.query_pattern is not None:
        row.query_pattern = body.query_pattern
    if body.metadata_json is not None:
        row.metadata_json = body.metadata_json

    db.flush()
    db.commit()
    db.refresh(row)
    return _to_rule_response(row)


def remove_search_rule(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    rule_id: str,
) -> None:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    affected = delete_rule(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
    )
    if affected == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SEARCH_RULE_NOT_FOUND")
    db.commit()


def create_synonym_rule(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: SynonymCreateRequest,
) -> SynonymResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    row = create_synonym(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        canonical_term=body.canonical_term,
        synonym_term=body.synonym_term,
        is_bidirectional=body.is_bidirectional,
        scope=body.scope,
        notes=body.notes,
        is_active=body.is_active,
    )
    db.commit()
    db.refresh(row)
    return _to_synonym_response(row)


def update_synonym_rule(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    synonym_id: str,
    body: SynonymUpdateRequest,
) -> SynonymResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    row = get_synonym(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        synonym_id=synonym_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SYNONYM_NOT_FOUND")

    if body.is_active is not None:
        row.is_active = body.is_active
    if body.is_bidirectional is not None:
        row.is_bidirectional = body.is_bidirectional
    if body.scope is not None:
        row.scope = body.scope
    if body.notes is not None:
        row.notes = body.notes

    db.flush()
    db.commit()
    db.refresh(row)
    return _to_synonym_response(row)


def remove_synonym_rule(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    synonym_id: str,
) -> None:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    affected = delete_synonym(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        synonym_id=synonym_id,
    )
    if affected == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SYNONYM_NOT_FOUND")
    db.commit()
