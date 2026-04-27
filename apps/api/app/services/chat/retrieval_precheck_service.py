import re
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models import Document, DocumentChunk, DocumentVersion, RetrievalControlRule, SynonymDictionary
from app.repositories.admin.search_control_repository import (
    fetch_retrieval_candidates,
    list_active_rules,
    list_active_synonyms,
)

TOKEN_SPLIT_REGEX = re.compile(r"[^0-9A-Za-z가-힣]+")


def normalize_query(question: str) -> str:
    return " ".join(question.strip().split()).lower()


def _tokenize(query: str) -> list[str]:
    return [token for token in TOKEN_SPLIT_REGEX.split(query) if token]


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


def _corpus_weight(corpus_domain: str, policy: dict[str, Any]) -> float:
    if not isinstance(policy, dict):
        return 0.0
    weights = policy.get("weights")
    if isinstance(weights, dict):
        return float(weights.get(corpus_domain, 0.0))
    return float(policy.get(corpus_domain, 0.0))


def _source_weight(source_type: str, policy: dict[str, Any]) -> float:
    if not isinstance(policy, dict):
        return 0.0
    weights = policy.get("sourceTypeWeights")
    if isinstance(weights, dict):
        return float(weights.get(source_type, 0.0))
    return 0.0


def _matches_rule(
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


def retrieve_for_precheck(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    question: str,
    top_k: int,
    corpus_domain_policy: dict[str, Any],
    search_control_policy: dict[str, Any],
) -> dict[str, Any]:
    normalized = normalize_query(question)
    tokens = _tokenize(normalized)

    synonyms = list_active_synonyms(db, organization_id, chatbot_id)
    expanded_tokens = _expand_tokens(tokens, synonyms)

    rules = list_active_rules(db, organization_id, chatbot_id)
    exclude_rules = [rule for rule in rules if rule.rule_type == "exclude"]
    boost_rules = [rule for rule in rules if rule.rule_type == "boost"]
    pin_rules = [rule for rule in rules if rule.rule_type == "pin"]

    rows = fetch_retrieval_candidates(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        question_terms=expanded_tokens,
        corpus_domains=None,
        source_types=None,
        include_inactive=False,
        limit_count=max(50, top_k * 8),
    )

    today = date.today()
    collected: list[dict[str, Any]] = []
    excluded_count = 0

    for chunk, document, version in rows:
        if any(
            _matches_rule(
                rule,
                query=normalized,
                document=document,
                document_version=version,
                chunk=chunk,
            )
            for rule in exclude_rules
        ):
            excluded_count += 1
            continue

        matched_keywords = [
            token
            for token in expanded_tokens
            if token in (chunk.text_content or "").lower()
            or token in (chunk.section_title or "").lower()
            or token in (document.title or "").lower()
        ]
        keyword_score = round(len(matched_keywords) / max(len(expanded_tokens), 1), 4)
        vector_score = 0.0  # placeholder for future embedding score

        version_signal = round(
            max(0.0, (200.0 - float(version.document_priority)) / 200.0)
            + max(0.0, min(version.version_number / 100.0, 0.2)),
            4,
        )
        corpus_signal = _corpus_weight(chunk.corpus_domain, corpus_domain_policy)
        source_signal = _source_weight(version.source_type, search_control_policy)

        recency_signal = 0.0
        if version.effective_date and version.effective_date <= today:
            recency_signal += 0.05
        if version.expiration_date and version.expiration_date < today:
            recency_signal -= 0.1
        recency_signal = round(recency_signal, 4)

        matched_boost_rules = [
            rule
            for rule in boost_rules
            if _matches_rule(
                rule,
                query=normalized,
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
            if _matches_rule(
                rule,
                query=normalized,
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

        collected.append(
            {
                "documentId": str(document.id),
                "documentName": document.title,
                "documentVersionId": str(version.id),
                "versionLabel": f"v{version.version_number}",
                "pageNumber": chunk.page_number,
                "sectionTitle": chunk.section_title,
                "corpusDomain": chunk.corpus_domain,
                "sourceType": version.source_type,
                "effectiveDate": version.effective_date.isoformat() if version.effective_date else None,
                "expirationDate": version.expiration_date.isoformat() if version.expiration_date else None,
                "keywordScore": keyword_score,
                "vectorScore": vector_score,
                "combinedScore": combined_score,
                "isPinned": is_pinned,
                "matchedKeywords": matched_keywords,
                "matchedBoostRuleIds": [str(rule.id) for rule in matched_boost_rules],
                "matchedPinRuleIds": [str(rule.id) for rule in matched_pin_rules],
                "contentSignals": {
                    "sectionTitle": chunk.section_title or "",
                    "textPreview": (chunk.text_content or "")[:220],
                },
            }
        )

    ranked = sorted(
        collected,
        key=lambda item: (0 if item["isPinned"] else 1, -item["combinedScore"]),
    )[:top_k]

    for index, item in enumerate(ranked, start=1):
        item["finalRank"] = index

    return {
        "normalizedQuery": normalized,
        "expandedTokens": expanded_tokens,
        "candidates": ranked,
        "trace": {
            "excludeRuleIds": [str(rule.id) for rule in exclude_rules],
            "boostRuleIds": [str(rule.id) for rule in boost_rules],
            "pinRuleIds": [str(rule.id) for rule in pin_rules],
            "excludedCount": excluded_count,
        },
    }
