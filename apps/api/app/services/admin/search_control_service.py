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
from app.services.chat.retrieval_precheck_service import search_relevant_chunks
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

TOKEN_SPLIT_REGEX = re.compile(r"[^0-9A-Za-z]+")


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

    retrieval_output = search_relevant_chunks(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        question=body.question,
        top_k=body.top_k,
        corpus_domain_policy=chatbot.corpus_domain_policy or {},
        search_control_policy=chatbot.search_control_policy or {},
        corpus_domains=body.corpus_domains,
        source_types=body.source_types,
        include_inactive=body.include_inactive,
    )
    retrieval_trace = dict(retrieval_output.get("trace") or {})
    candidates: list[SearchTestCandidate] = []
    ranking_order: list[dict[str, Any]] = []

    for item in retrieval_output.get("candidates") or []:
        vector_score = item.get("vectorScore")
        matched_boost_rule_ids = list(item.get("matchedBoostRuleIds") or [])
        matched_pin_rule_ids = list(item.get("matchedPinRuleIds") or [])
        explanation = RetrievalExplanation(
            matched_keywords=list(item.get("matchedKeywords") or []),
            semantic_relevance={
                "vectorScore": vector_score,
                "summary": "runtime retrieval score" if vector_score is not None else "vector score unavailable",
            },
            corpus_priority_applied={
                "corpusDomain": item.get("corpusDomain"),
                "applied": True,
            },
            document_version_priority_applied={
                "versionLabel": item.get("versionLabel"),
                "applied": True,
            },
            recency_effective_date_signal_applied={
                "effectiveDate": item.get("effectiveDate"),
                "expirationDate": item.get("expirationDate"),
                "applied": bool(item.get("effectiveDate") or item.get("expirationDate")),
            },
            manual_rule_applied=RuleEffectSummary(
                excluded=False,
                boosted=bool(matched_boost_rule_ids),
                pinned=bool(item.get("isPinned")),
                boost_value=0,
                reason=None,
            ),
        )
        candidate = SearchTestCandidate(
            document_id=str(item.get("documentId") or ""),
            document_name=str(item.get("documentName") or ""),
            document_version_id=str(item.get("documentVersionId") or ""),
            version_label=item.get("versionLabel"),
            page_number=item.get("pageNumber"),
            section_title=item.get("sectionTitle"),
            corpus_domain=str(item.get("corpusDomain") or ""),
            source_type=str(item.get("sourceType") or ""),
            effective_date=item.get("effectiveDate"),
            expiration_date=item.get("expirationDate"),
            keyword_score=float(item.get("keywordScore") or 0.0),
            vector_score=float(vector_score) if isinstance(vector_score, (int, float)) else None,
            combined_score=float(item.get("combinedScore") or 0.0),
            final_rank=int(item.get("finalRank") or 0),
            selected_by_rules={
                "pinned": bool(item.get("isPinned")),
                "pinRuleIds": matched_pin_rule_ids,
                "thresholdPassed": bool(item.get("thresholdPassed")),
                "usedInPrompt": bool(item.get("usedInPrompt")),
            },
            exclusion_or_boost_applied={
                "boostRuleIds": matched_boost_rule_ids,
            },
            explanation=explanation,
        )
        candidates.append(candidate)
        ranking_order.append(
            {
                "rank": candidate.final_rank,
                "documentId": candidate.document_id,
                "documentVersionId": candidate.document_version_id,
                "combinedScore": candidate.combined_score,
                "isPinned": bool(item.get("isPinned")),
                "thresholdPassed": bool(item.get("thresholdPassed")),
                "usedInPrompt": bool(item.get("usedInPrompt")),
            }
        )

    request_id = f"search_test_{uuid.uuid4().hex[:16]}"
    trace = AdminSearchTestTrace(
        original_question=body.question,
        normalized_question=str(retrieval_output.get("normalizedQuery") or ""),
        expanded_terms=list(retrieval_output.get("expandedTokens") or []),
        applied_filters={
            "corpusDomains": body.corpus_domains or [],
            "sourceTypes": body.source_types or [],
            "topK": body.top_k,
            "includeInactive": body.include_inactive,
            "filterScope": retrieval_output.get("filterScope"),
            "threshold": retrieval_output.get("retrievalThreshold"),
            "usedInPromptCount": retrieval_output.get("usedInPromptCount"),
            "sourceDiversityApplied": retrieval_output.get("sourceDiversityApplied"),
        },
        applied_rules={
            "excludeRuleIds": retrieval_trace.get("excludeRuleIds", []),
            "boostRuleIds": retrieval_trace.get("boostRuleIds", []),
            "pinRuleIds": retrieval_trace.get("pinRuleIds", []),
            "excludedCount": retrieval_trace.get("excludedCount", 0),
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
            "candidateCount": len(candidates),
            "resultType": "retrieval_test",
        },
    )
    db.commit()

    return AdminSearchTestResponse(
        request_id=request_id,
        chatbot_id=chatbot_id,
        candidates=candidates,
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
