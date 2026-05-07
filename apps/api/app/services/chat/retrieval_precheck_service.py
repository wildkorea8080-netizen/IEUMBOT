import logging
import math
import re
import time
from datetime import date
from typing import Any
from urllib.parse import urlparse

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Document,
    DocumentChunk,
    DocumentVersion,
    RetrievalControlRule,
    SynonymDictionary,
)
from app.repositories.admin.search_control_repository import (
    fetch_retrieval_candidates,
    list_active_rules,
    list_active_synonyms,
)
from app.services.embedding_service import coerce_embedding_vector, generate_embedding

TOKEN_SPLIT_REGEX = re.compile(r"[^0-9A-Za-z가-힣]+")
DEFAULT_RETRIEVAL_THRESHOLD = 0.55
WEBSITE_RETRIEVAL_THRESHOLD = 0.28
DOCUMENT_RETRIEVAL_THRESHOLD = 0.32
FAQ_RETRIEVAL_THRESHOLD = 0.25
TOP1_RESCUE_SCORE = 0.30
MAX_PROMPT_CHUNKS = 5
MAX_CHUNKS_PER_KNOWLEDGE_ITEM = 2
MAX_CHUNKS_PER_SOURCE_URL = 2
POLICY_KEYWORD_BOOST = 0.12
POLICY_KEYWORD_BOOST_TERMS = ("융자", "지원", "조건", "신청", "대상", "자부담", "금리", "사업비")
logger = logging.getLogger(__name__)
URL_MARKER_REGEX = re.compile(r"\[URL\]\s+(https?://\S+)", re.IGNORECASE)
CONTACT_QUERY_TERMS = {"연락처", "전화", "전화번호", "문의처", "담당자", "담당부서"}
CONTACT_EXPANSION_TERMS = ["연락처", "전화", "전화번호", "문의처", "담당자", "담당부서", "사업관리실"]
QUALIFICATION_QUERY_TERMS = {"자격", "자격요건", "지원자격", "신청자격", "요건", "대상"}
QUALIFICATION_EXPANSION_TERMS = [
    "자격",
    "자격요건",
    "지원자격",
    "신청자격",
    "선발자격",
    "지원대상",
    "교육대상",
    "응시연령",
    "학력제한",
]
OVERSEAS_INTERN_QUERY_TERMS = {"해외인턴", "인턴"}
OVERSEAS_INTERN_EXPANSION_TERMS = ["해외인턴", "해외 인턴", "인턴사원", "인턴신청기업", "인턴기업"]
KOREAN_PARTICLE_SUFFIXES = [
    "으로",
    "에서",
    "에게",
    "한테",
    "부터",
    "까지",
    "처럼",
    "보다",
    "라고",
    "이고",
    "이며",
    "으로는",
    "으로도",
    "에는",
    "에도",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "의",
    "와",
    "과",
    "도",
    "만",
    "로",
]


def normalize_query(question: str) -> str:
    return " ".join(question.strip().split()).lower()


def _tokenize(query: str) -> list[str]:
    return [token for token in TOKEN_SPLIT_REGEX.split(query) if token]


def _normalize_token_variants(tokens: list[str]) -> list[str]:
    normalized: set[str] = set()
    for token in tokens:
        stripped = token.strip().lower()
        if not stripped:
            continue
        normalized.add(stripped)
        for suffix in KOREAN_PARTICLE_SUFFIXES:
            if stripped.endswith(suffix) and len(stripped) > len(suffix) + 1:
                normalized.add(stripped[: -len(suffix)])
    return sorted(normalized)


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
    if expanded.intersection(CONTACT_QUERY_TERMS):
        expanded.update(CONTACT_EXPANSION_TERMS)
    if expanded.intersection(QUALIFICATION_QUERY_TERMS):
        expanded.update(QUALIFICATION_EXPANSION_TERMS)
    if expanded.intersection(OVERSEAS_INTERN_QUERY_TERMS):
        expanded.update(OVERSEAS_INTERN_EXPANSION_TERMS)
    return sorted(expanded)


def _embedding_type_name(value: Any) -> str:
    if value is None:
        return "NoneType"
    return type(value).__name__


def _cosine_similarity(left: Any, right: Any) -> float:
    left_vector = coerce_embedding_vector(left)
    right_vector = coerce_embedding_vector(right)
    if left_vector is None or right_vector is None or len(left_vector) != len(right_vector):
        return 0.0
    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for left_value, right_value in zip(left_vector, right_vector, strict=False):
        dot += float(left_value) * float(right_value)
        left_norm += float(left_value) * float(left_value)
        right_norm += float(right_value) * float(right_value)
    if left_norm <= 0 or right_norm <= 0:
        return 0.0
    return max(0.0, min(1.0, dot / (math.sqrt(left_norm) * math.sqrt(right_norm))))


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


def _extract_source_url(
    *,
    chunk: DocumentChunk,
    document: Document,
    version: DocumentVersion,
) -> str | None:
    if version.source_type == "website":
        marker_match = URL_MARKER_REGEX.search(chunk.text_content or "")
        if marker_match:
            return marker_match.group(1).strip()

    chunk_metadata = chunk.metadata_json if isinstance(chunk.metadata_json, dict) else {}
    chunk_url = chunk_metadata.get("url")
    if isinstance(chunk_url, str) and chunk_url.strip():
        return chunk_url.strip()

    document_metadata = document.metadata_json if isinstance(document.metadata_json, dict) else {}
    document_url = document_metadata.get("url")
    if isinstance(document_url, str) and document_url.strip():
        return document_url.strip()

    return None


def _build_section_title(
    *,
    chunk: DocumentChunk,
    document: Document,
    version: DocumentVersion,
    source_url: str | None,
) -> str | None:
    section_title = (chunk.section_title or "").strip() or None
    if version.source_type != "website":
        return section_title

    document_title = (document.title or "").strip()
    if section_title and section_title != document_title:
        return section_title

    if not source_url:
        return section_title

    parsed = urlparse(source_url)
    host = parsed.netloc.strip()
    path = (parsed.path or "/").rstrip("/") or "/"
    query = f"?{parsed.query}" if parsed.query else ""
    location = f"{host}{path}{query}" if host else f"{path}{query}"
    return location or section_title


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


def _get_retrieval_threshold() -> float:
    try:
        threshold = float(settings.api_retrieval_threshold)
    except (TypeError, ValueError):
        return DEFAULT_RETRIEVAL_THRESHOLD
    if threshold < 0:
        return DEFAULT_RETRIEVAL_THRESHOLD
    return threshold


def _is_faq_candidate(item: dict[str, Any]) -> bool:
    values = [
        item.get("sourceType"),
        item.get("corpusDomain"),
        item.get("documentName"),
        item.get("sectionTitle"),
        item.get("fileName"),
    ]
    haystack = " ".join(str(value or "") for value in values).lower()
    return "faq" in haystack or "자주" in haystack


def _dynamic_threshold_for_candidate(item: dict[str, Any]) -> float:
    if _is_faq_candidate(item):
        return FAQ_RETRIEVAL_THRESHOLD
    source_type = str(item.get("sourceType") or "").lower()
    if source_type == "website":
        return WEBSITE_RETRIEVAL_THRESHOLD
    if source_type in {"document", "file", "text"}:
        return DOCUMENT_RETRIEVAL_THRESHOLD
    return _get_retrieval_threshold()


def _policy_keyword_boost(question_text: str, chunk_text: str) -> tuple[float, list[str]]:
    query_terms = [term for term in POLICY_KEYWORD_BOOST_TERMS if term in question_text]
    if not query_terms:
        return 0.0, []
    matched = [term for term in query_terms if term in chunk_text]
    if not matched:
        return 0.0, []
    return POLICY_KEYWORD_BOOST, matched


def _is_undefined_column_error(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc} {getattr(exc, 'orig', '')}".lower()
    return "undefinedcolumn" in text or "undefined column" in text or "does not exist" in text


def _empty_retrieval_output(
    *,
    organization_id: str,
    chatbot_id: str,
    question: str,
    expanded_tokens: list[str] | None,
    started_at: float,
    threshold: float,
    fallback_reason: str | None = None,
    query_embedding_generated: bool = False,
    query_embedding_length: int | None = None,
    query_embedding_type: str | None = None,
    exception: Exception | None = None,
    exception_type: str | None = None,
    exception_message: str | None = None,
) -> dict[str, Any]:
    effective_exception_type = exception_type or (type(exception).__name__ if exception is not None else None)
    effective_exception_message = exception_message or (str(exception)[:1000] if exception is not None else None)
    trace: dict[str, Any] = {
        "excludeRuleIds": [],
        "boostRuleIds": [],
        "pinRuleIds": [],
        "excludedCount": 0,
        "filterScope": {
            "organizationId": organization_id,
            "chatbotId": chatbot_id,
        },
        "threshold": threshold,
        "dynamicThreshold": threshold,
        "usedInPromptCount": 0,
        "sourceDiversityApplied": False,
        "fallbackReason": fallback_reason,
        "rescuedByTop1Rule": False,
        "keywordBoostApplied": False,
        "finalPromptChunkCount": 0,
        "queryEmbeddingGenerated": query_embedding_generated,
        "queryEmbeddingLength": query_embedding_length,
        "queryEmbeddingType": query_embedding_type,
    }
    if effective_exception_type is not None or effective_exception_message is not None:
        trace["exceptionType"] = effective_exception_type
        trace["exceptionMessage"] = effective_exception_message
    if exception is not None:
        trace["migrationHint"] = "Run Alembic migration 20260507_0016_knowledge_diagnostics."

    return {
        "normalizedQuery": normalize_query(question),
        "expandedTokens": expanded_tokens or [],
        "candidates": [],
        "promptCandidates": [],
        "retrievalThreshold": threshold,
        "usedInPromptCount": 0,
        "retrievedCount": 0,
        "sourceDiversityApplied": False,
        "filterScope": {
            "organizationId": organization_id,
            "chatbotId": chatbot_id,
        },
        "knowledgeAvailable": True,
        "retrievalLatencyMs": int((time.perf_counter() - started_at) * 1000),
        "fallbackReason": fallback_reason,
        "queryEmbeddingGenerated": query_embedding_generated,
        "queryEmbeddingLength": query_embedding_length,
        "queryEmbeddingType": query_embedding_type,
        "exceptionType": trace.get("exceptionType"),
        "exceptionMessage": trace.get("exceptionMessage"),
        "trace": trace,
    }


def _apply_prompt_selection(
    candidates: list[dict[str, Any]],
    *,
    threshold: float,
    prompt_limit: int,
) -> tuple[list[dict[str, Any]], bool, bool]:
    prompt_candidates: list[dict[str, Any]] = []
    per_knowledge_item: dict[str, int] = {}
    per_source_url: dict[str, int] = {}
    source_diversity_applied = False
    rescued_by_top1_rule = False

    for index, item in enumerate(candidates):
        score = float(item.get("combinedScore") or 0.0)
        dynamic_threshold = float(item.get("dynamicThreshold") or threshold)
        threshold_passed = score >= dynamic_threshold
        rescued = index == 0 and score >= TOP1_RESCUE_SCORE and not threshold_passed
        if rescued:
            rescued_by_top1_rule = True
        item["thresholdPassed"] = threshold_passed
        item["dynamicThreshold"] = dynamic_threshold
        item["rescuedByTop1Rule"] = rescued
        item["usedInPrompt"] = False
        if not threshold_passed and not rescued:
            continue

        knowledge_item_id = str(item.get("documentId") or "")
        used_count = per_knowledge_item.get(knowledge_item_id, 0)
        if used_count >= MAX_CHUNKS_PER_KNOWLEDGE_ITEM:
            source_diversity_applied = True
            continue
        source_url = str(item.get("sourceUrl") or item.get("documentId") or "")
        source_used_count = per_source_url.get(source_url, 0)
        if source_used_count >= MAX_CHUNKS_PER_SOURCE_URL:
            source_diversity_applied = True
            continue
        if len(prompt_candidates) >= prompt_limit:
            continue

        per_knowledge_item[knowledge_item_id] = used_count + 1
        per_source_url[source_url] = source_used_count + 1
        item["usedInPrompt"] = True
        prompt_candidates.append(item)

    return prompt_candidates, source_diversity_applied, rescued_by_top1_rule


def search_relevant_chunks(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    question: str,
    top_k: int,
    corpus_domain_policy: dict[str, Any],
    search_control_policy: dict[str, Any],
    corpus_domains: list[str] | None = None,
    source_types: list[str] | None = None,
    include_inactive: bool = False,
) -> dict[str, Any]:
    started_at = time.perf_counter()
    normalized = normalize_query(question)
    tokens = _normalize_token_variants(_tokenize(normalized))

    synonyms = list_active_synonyms(db, organization_id, chatbot_id)
    expanded_tokens = _normalize_token_variants(_expand_tokens(tokens, synonyms))
    query_embedding_raw: Any = None
    query_embedding_exception: Exception | None = None
    try:
        query_embedding_raw = generate_embedding(db, question)
    except Exception as exc:  # pragma: no cover - defensive trace path
        query_embedding_exception = exc
        logger.exception(
            "Query embedding generation failed",
            extra={"organization_id": organization_id, "chatbot_id": chatbot_id},
        )

    query_embedding = coerce_embedding_vector(query_embedding_raw)
    query_embedding_type = _embedding_type_name(query_embedding_raw)
    query_embedding_length = len(query_embedding) if query_embedding is not None else 0
    if query_embedding is None:
        message = "Query embedding was not generated."
        if query_embedding_exception is not None:
            message = str(query_embedding_exception)[:1000]
        logger.warning(
            "Knowledge retrieval skipped because query embedding was not generated organization_id=%s chatbot_id=%s embedding_type=%s",
            organization_id,
            chatbot_id,
            query_embedding_type,
        )
        return _empty_retrieval_output(
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            question=question,
            expanded_tokens=expanded_tokens,
            started_at=started_at,
            threshold=_get_retrieval_threshold(),
            fallback_reason="EMBEDDING_FAILED",
            query_embedding_generated=False,
            query_embedding_length=query_embedding_length,
            query_embedding_type=query_embedding_type,
            exception_type=type(query_embedding_exception).__name__ if query_embedding_exception is not None else "EmbeddingGenerationFailed",
            exception_message=message,
        )

    rules = list_active_rules(db, organization_id, chatbot_id)
    exclude_rules = [rule for rule in rules if rule.rule_type == "exclude"]
    boost_rules = [rule for rule in rules if rule.rule_type == "boost"]
    pin_rules = [rule for rule in rules if rule.rule_type == "pin"]

    threshold = _get_retrieval_threshold()
    try:
        rows = fetch_retrieval_candidates(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            question_terms=expanded_tokens,
            corpus_domains=corpus_domains,
            source_types=source_types,
            include_inactive=include_inactive,
            limit_count=max(50, top_k * 8),
            query_embedding=query_embedding,
        )
    except SQLAlchemyError as exc:
        if not _is_undefined_column_error(exc):
            raise
        logger.exception(
            "Knowledge retrieval skipped because diagnostics migration columns are missing",
            extra={"organization_id": organization_id, "chatbot_id": chatbot_id},
        )
        db.rollback()
        return _empty_retrieval_output(
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            question=question,
            expanded_tokens=expanded_tokens,
            started_at=started_at,
            threshold=threshold,
            query_embedding_generated=True,
            query_embedding_length=query_embedding_length,
            query_embedding_type=query_embedding_type,
            exception=exc,
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
        chunk_embedding = coerce_embedding_vector(chunk.embedding)
        vector_score = round(_cosine_similarity(query_embedding, chunk_embedding), 4) if chunk_embedding is not None else None

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
            (keyword_score * 0.45)
            + ((vector_score or 0.0) * 0.35)
            + (corpus_signal * 0.05)
            + (source_signal * 0.05)
            + (version_signal * 0.1)
            + recency_signal
            + manual_boost_signal,
            4,
        )

        source_url = _extract_source_url(
            chunk=chunk,
            document=document,
            version=version,
        )
        section_title = _build_section_title(
            chunk=chunk,
            document=document,
            version=version,
            source_url=source_url,
        )
        text_preview = (chunk.text_content or "")[:1200]
        boost_text = f"{section_title or ''} {text_preview}".lower()
        keyword_boost, boosted_terms = _policy_keyword_boost(normalized, boost_text)
        if keyword_boost:
            combined_score = round(min(combined_score + keyword_boost, 1.0), 4)

        collected.append(
            {
                "documentId": str(document.id),
                "chunkId": str(chunk.id),
                "documentName": document.title,
                "documentVersionId": str(version.id),
                "versionLabel": f"v{version.version_number}",
                "fileName": version.file_name,
                "chunkIndex": chunk.chunk_order,
                "pageNumber": chunk.page_number,
                "sectionTitle": section_title,
                "sourceUrl": source_url,
                "corpusDomain": chunk.corpus_domain,
                "sourceType": version.source_type,
                "effectiveDate": version.effective_date.isoformat() if version.effective_date else None,
                "expirationDate": version.expiration_date.isoformat() if version.expiration_date else None,
                "keywordScore": keyword_score,
                "vectorScore": vector_score,
                "combinedScore": combined_score,
                "keywordBoostApplied": bool(keyword_boost),
                "keywordBoostValue": keyword_boost,
                "keywordBoostTerms": boosted_terms,
                "isPinned": is_pinned,
                "matchedKeywords": matched_keywords,
                "matchedBoostRuleIds": [str(rule.id) for rule in matched_boost_rules],
                "matchedPinRuleIds": [str(rule.id) for rule in matched_pin_rules],
                "contentSignals": {
                    "sectionTitle": section_title or "",
                    "textPreview": text_preview,
                },
            }
        )

    ranked = sorted(
        collected,
        key=lambda item: (0 if item["isPinned"] else 1, -item["combinedScore"]),
    )[:top_k]

    for index, item in enumerate(ranked, start=1):
        item["finalRank"] = index
        item["dynamicThreshold"] = _dynamic_threshold_for_candidate(item)
        item["rescuedByTop1Rule"] = False

    prompt_candidates, source_diversity_applied, rescued_by_top1_rule = _apply_prompt_selection(
        ranked,
        threshold=threshold,
        prompt_limit=MAX_PROMPT_CHUNKS,
    )
    keyword_boost_applied = any(bool(item.get("keywordBoostApplied")) for item in ranked)
    dynamic_threshold = min((float(item.get("dynamicThreshold") or threshold) for item in ranked), default=threshold)

    return {
        "normalizedQuery": normalized,
        "expandedTokens": expanded_tokens,
        "candidates": ranked,
        "promptCandidates": prompt_candidates,
        "retrievalThreshold": dynamic_threshold,
        "baseRetrievalThreshold": threshold,
        "usedInPromptCount": len(prompt_candidates),
        "retrievedCount": len(ranked),
        "sourceDiversityApplied": source_diversity_applied,
        "queryEmbeddingGenerated": True,
        "queryEmbeddingLength": query_embedding_length,
        "queryEmbeddingType": query_embedding_type,
        "filterScope": {
            "organizationId": organization_id,
            "chatbotId": chatbot_id,
        },
        "knowledgeAvailable": bool(rows),
        "retrievalLatencyMs": int((time.perf_counter() - started_at) * 1000),
        "trace": {
            "excludeRuleIds": [str(rule.id) for rule in exclude_rules],
            "boostRuleIds": [str(rule.id) for rule in boost_rules],
            "pinRuleIds": [str(rule.id) for rule in pin_rules],
            "excludedCount": excluded_count,
            "filterScope": {
                "organizationId": organization_id,
                "chatbotId": chatbot_id,
            },
            "threshold": threshold,
            "dynamicThreshold": dynamic_threshold,
            "usedInPromptCount": len(prompt_candidates),
            "sourceDiversityApplied": source_diversity_applied,
            "rescuedByTop1Rule": rescued_by_top1_rule,
            "keywordBoostApplied": keyword_boost_applied,
            "finalPromptChunkCount": len(prompt_candidates),
            "queryEmbeddingGenerated": True,
            "queryEmbeddingLength": query_embedding_length,
            "queryEmbeddingType": query_embedding_type,
        },
    }


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
    return search_relevant_chunks(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        question=question,
        top_k=top_k,
        corpus_domain_policy=corpus_domain_policy,
        search_control_policy=search_control_policy,
        include_inactive=False,
    )
