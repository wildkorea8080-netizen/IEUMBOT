import logging
import math
import os
import re
import time
from datetime import date
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import func, or_, select
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
TOP1_RESCUE_SCORE = 0.26
MAX_CHUNKS_PER_KNOWLEDGE_ITEM = 2
MAX_CHUNKS_PER_SOURCE_URL = 2
POLICY_KEYWORD_BOOST = 0.10
SEMANTIC_RESCUE_VECTOR_SCORE = 0.32
SEMANTIC_STRONG_VECTOR_SCORE = 0.38
SEMANTIC_SCORE_FLOOR = 0.28
KOREAN_POLICY_KEYWORD_BOOST_TERMS = (
    "주요사업",
    "주요",
    "사업",
    "사업안내",
    "지원사업",
    "상담",
    "서비스",
    "기관소개",
    "센터소개",
    "해외농업",
    "해외농업자원개발",
    "해외진출",
    "해외인턴",
    "국내반입",
)
OVERVIEW_QUERY_TERMS = (
    "주요사업",
    "주요 사업",
    "사업",
    "사업안내",
    "지원사업",
    "기관소개",
    "서비스소개",
    "무슨 일",
    "하는 일",
    "무엇을",
    "뭐 하는",
    "소개",
    "개요",
    "해외농업",
    "해외농업길잡이",
    "해외농업자원개발",
)
OVERVIEW_EVIDENCE_TERMS = (
    "사업",
    "사업안내",
    "지원사업",
    "상담",
    "교육",
    "권리구제",
    "노동법률",
    "노무",
    "센터소개",
    "해외농업",
    "해외농업자원개발",
    "해외진출",
    "해외인턴",
    "국내반입",
)
COMPOUND_TOKEN_EXPANSIONS = {
    "주요사업": ["주요", "사업", "사업안내", "지원사업"],
    "주요사업을": ["주요", "사업", "사업안내", "지원사업"],
    "지원사업": ["지원", "사업", "사업안내"],
    "지원사업은": ["지원", "사업", "사업안내"],
    "서울노동권익센터": ["서울", "노동", "노동권익", "센터"],
    "서울노동권익센터는": ["서울", "노동", "노동권익", "센터"],
    "해외농업길잡이": ["해외농업", "해외농업자원개발", "해외진출", "해외인턴", "국내반입"],
    "해외농업길잡이는": ["해외농업", "해외농업자원개발", "해외진출", "해외인턴", "국내반입"],
    "해외농업": ["해외농업자원개발", "해외진출", "해외인턴", "국내반입"],
}
OVERVIEW_RESCUE_MARGIN = 0.04
OVERVIEW_RESCUE_VECTOR_SCORE = 0.32
POLICY_KEYWORD_BOOST_TERMS = (
    "융자",
    "지원",
    "조건",
    "신청",
    "대상",
    "자부담",
    "금리",
    "사업비",
    "해외농업",
    "해외농업자원개발",
    "해외진출",
    "해외인턴",
    "국내반입",
    "사업신고",
)
NOISE_SECTION_PENALTY = 0.15
# 실제 내비게이션/UI 노이즈만 패널티 적용 — 공지사항·FAQ·서류 등 유용한 콘텐츠는 제외
NOISE_SECTION_TERMS = (
    "이용약관",
    "개인정보처리방침",
    "사이트맵",
    "저작권",
    "회원가입",
    "로그인",
)
logger = logging.getLogger(__name__)
URL_MARKER_REGEX = re.compile(r"\[URL\]\s+(https?://\S+)", re.IGNORECASE)


def _float_env(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return default
    return value if value >= 0 else default


def _int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return default
    return value if value >= 1 else default


def _rag_float(settings_dict: dict[str, Any] | None, key: str, default: float) -> float:
    try:
        value = float((settings_dict or {}).get(key, default))
    except (TypeError, ValueError):
        return default
    return max(0.0, min(value, 1.0))


def _rag_int(settings_dict: dict[str, Any] | None, key: str, default: int, *, minimum: int, maximum: int) -> int:
    try:
        value = int((settings_dict or {}).get(key, default))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(value, maximum))


WEBSITE_RETRIEVAL_THRESHOLD = _float_env("RETRIEVAL_THRESHOLD_WEBSITE", 0.25)
DOCUMENT_RETRIEVAL_THRESHOLD = _float_env("RETRIEVAL_THRESHOLD_DOCUMENT", 0.28)
FAQ_RETRIEVAL_THRESHOLD = _float_env("RETRIEVAL_THRESHOLD_FAQ", 0.22)
MAX_PROMPT_CHUNKS = _int_env("MAX_PROMPT_CHUNKS", 5)
CONTACT_QUERY_TERMS = {"연락처", "전화", "전화번호", "문의처", "담당자", "담당부서"}
CONTACT_EXPANSION_TERMS = ["연락처", "전화", "전화번호", "문의처", "담당자", "담당부서"]
QUALIFICATION_QUERY_TERMS = {"자격", "자격요건", "지원자격", "신청자격", "요건", "대상"}
QUALIFICATION_EXPANSION_TERMS = [
    "자격",
    "자격요건",
    "지원자격",
    "신청자격",
    "선발자격",
    "지원대상",
    "응시연령",
]
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


def _is_overview_query(question: str) -> bool:
    normalized = normalize_query(question)
    return any(term in normalized for term in OVERVIEW_QUERY_TERMS)


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
        expanded.update(COMPOUND_TOKEN_EXPANSIONS.get(token, []))
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


def _dynamic_threshold_for_candidate(
    item: dict[str, Any],
    *,
    question: str = "",
    threshold_doc: float = 0.28,
    threshold_web: float = 0.25,
    threshold_faq: float = 0.22,
) -> float:
    """
    소스타입 기본 임계값에 질문 유형 보정을 적용.

    보정 방향:
    - 연락처 질문: -0.05 (낮게 → 전화번호 청크 더 넓게 수집)
    - 구조적 질문: +0.03 (높게 → 정책 정보 정확도 우선)
    - 개요 질문:   -0.03 (낮게 → 소개 내용 폭넓게 수집)
    """
    # 1단계: 소스타입 기본 임계값
    if _is_faq_candidate(item):
        base = threshold_faq
    else:
        source_type = str(item.get("sourceType") or "").lower()
        if source_type == "website":
            base = threshold_web
        elif source_type in {"document", "file", "text"}:
            base = threshold_doc
        else:
            base = _get_retrieval_threshold()     # 환경변수 기본값

    # 2단계: 질문 유형 보정 (question이 없으면 보정 없음)
    if not question:
        return base

    q = question.lower()

    # 연락처 질문 감지 (policy_evaluation_service._is_contact_question과 동일 로직)
    contact_signals = ["전화", "연락처", "담당자", "담당부서", "문의처", "이메일", "팩스"]
    if any(s in q for s in contact_signals):
        return max(base - 0.05, 0.15)   # 하한선 0.15

    if "상담" in q and any(s in q for s in ("신청", "방법", "어떻게", "문의")):
        return max(base - 0.03, 0.15)

    # 구조적 질문 감지 (자격/절차/일정)
    structured_signals = ["자격", "요건", "조건", "신청", "절차", "방법", "기간", "일정", "마감"]
    if any(s in q for s in structured_signals):
        return min(base + 0.03, 0.45)   # 상한선 0.45

    # 개요/소개 질문 감지
    overview_signals = ["소개", "개요", "무엇", "뭔가요", "어떤", "역할", "기능", "하는 곳"]
    if any(s in q for s in overview_signals):
        return max(base - 0.03, 0.15)   # 하한선 0.15

    if _is_overview_query(q):
        return max(base - 0.03, 0.15)

    return base


def _policy_keyword_boost(question_text: str, chunk_text: str) -> tuple[float, list[str]]:
    boost_terms = (*POLICY_KEYWORD_BOOST_TERMS, *KOREAN_POLICY_KEYWORD_BOOST_TERMS)
    query_terms = [term for term in boost_terms if term in question_text]
    if _is_overview_query(question_text):
        query_terms = sorted(set([*query_terms, *OVERVIEW_EVIDENCE_TERMS]))
    if not query_terms:
        return 0.0, []
    matched = [term for term in query_terms if term in chunk_text]
    if not matched:
        return 0.0, []
    return POLICY_KEYWORD_BOOST, matched


def _noise_section_penalty(text: str) -> tuple[float, list[str]]:
    lowered = text.lower()
    matched = [term for term in NOISE_SECTION_TERMS if term.lower() in lowered]
    if not matched:
        return 0.0, []
    return NOISE_SECTION_PENALTY, matched


def _semantic_evidence_adjustment(
    *,
    vector_score: float | None,
    keyword_score: float,
    combined_score: float,
    source_type: str,
) -> tuple[float, bool, str | None]:
    if vector_score is None:
        return combined_score, False, None
    if source_type not in {"website", "document", "file", "text"}:
        return combined_score, False, None
    if vector_score >= SEMANTIC_STRONG_VECTOR_SCORE:
        return max(combined_score, SEMANTIC_SCORE_FLOOR), True, "strong_vector"
    if vector_score >= SEMANTIC_RESCUE_VECTOR_SCORE and keyword_score > 0:
        return max(combined_score, SEMANTIC_SCORE_FLOOR), True, "vector_with_lexical_overlap"
    return combined_score, False, None




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
    scope_diagnostics: dict[str, Any] | None = None,
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
        "sectionDiversityApplied": False,
        "fallbackReason": fallback_reason,
        "rescuedByTop1Rule": False,
        "keywordBoostApplied": False,
        "noisePenaltyApplied": False,
        "semanticEvidenceApplied": False,
        "semanticRescued": False,
        "overviewBoostApplied": False,
        "overviewTerms": [],
        "overviewThreshold": None,
        "overviewRescued": False,
        "finalPromptChunkCount": 0,
        "queryEmbeddingGenerated": query_embedding_generated,
        "queryEmbeddingLength": query_embedding_length,
        "queryEmbeddingType": query_embedding_type,
        "scopeDiagnostics": scope_diagnostics or {},
        "searchableChunkCount": (scope_diagnostics or {}).get("searchableChunkCount"),
        "excludedChunkCountByReason": (scope_diagnostics or {}).get("excludedChunkCountByReason", {}),
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
        "scopeDiagnostics": scope_diagnostics or {},
        "exceptionType": trace.get("exceptionType"),
        "exceptionMessage": trace.get("exceptionMessage"),
        "trace": trace,
    }


def _apply_prompt_selection(
    candidates: list[dict[str, Any]],
    *,
    threshold: float,
    threshold_doc: float = 0.28,
    threshold_web: float = 0.25,
    threshold_faq: float = 0.22,
    question: str = "",
    prompt_limit: int,
) -> tuple[list[dict[str, Any]], bool, bool, bool, bool]:
    prompt_candidates: list[dict[str, Any]] = []
    per_knowledge_item: dict[str, int] = {}
    per_source_url: dict[str, int] = {}
    per_section_title: dict[str, int] = {}
    source_diversity_applied = False
    section_diversity_applied = False
    rescued_by_top1_rule = False
    semantic_rescued = False

    overview_query = _is_overview_query(question)

    for index, item in enumerate(candidates):
        item["sectionDuplicateSkipped"] = False
        score = float(item.get("combinedScore") or 0.0)
        fallback_threshold = min(threshold, threshold_doc, threshold_web, threshold_faq)
        dynamic_threshold = float(item.get("dynamicThreshold") or fallback_threshold)
        threshold_passed = score >= dynamic_threshold
        semantic_rescue_candidate = bool(item.get("semanticEvidenceApplied")) and score >= max(
            SEMANTIC_SCORE_FLOOR,
            dynamic_threshold - 0.08,
        )
        overview_rescue_candidate = (
            overview_query
            and index == 0
            and str(item.get("sourceType") or "").lower() == "website"
            and score >= max(0.0, dynamic_threshold - OVERVIEW_RESCUE_MARGIN)
            and float(item.get("vectorScore") or 0.0) >= OVERVIEW_RESCUE_VECTOR_SCORE
        )
        rescued = (
            index == 0
            and (score >= TOP1_RESCUE_SCORE or semantic_rescue_candidate or overview_rescue_candidate)
            and not threshold_passed
        )
        if rescued:
            rescued_by_top1_rule = True
            if semantic_rescue_candidate:
                semantic_rescued = True
        item["thresholdPassed"] = threshold_passed
        item["dynamicThreshold"] = dynamic_threshold
        item["rescuedByTop1Rule"] = rescued
        item["semanticRescued"] = bool(semantic_rescue_candidate and rescued)
        item["overviewRescued"] = bool(overview_rescue_candidate and rescued)
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
        section_title = str(item.get("sectionTitle") or "").strip()
        if section_title:
            section_used_count = per_section_title.get(section_title, 0)
            if section_used_count >= 1:
                item["sectionDuplicateSkipped"] = True
                section_diversity_applied = True
                continue
        if len(prompt_candidates) >= prompt_limit:
            continue

        per_knowledge_item[knowledge_item_id] = used_count + 1
        per_source_url[source_url] = source_used_count + 1
        if section_title:
            per_section_title[section_title] = per_section_title.get(section_title, 0) + 1
        item["usedInPrompt"] = True
        prompt_candidates.append(item)

    return (
        prompt_candidates,
        source_diversity_applied,
        rescued_by_top1_rule,
        section_diversity_applied,
        semantic_rescued,
    )


def _count_chunks(db: Session, *conditions: Any) -> int:
    stmt = (
        select(func.count(DocumentChunk.id))
        .join(Document, DocumentChunk.document_id == Document.id)
        .join(DocumentVersion, DocumentChunk.document_version_id == DocumentVersion.id)
        .where(*conditions)
    )
    return int(db.execute(stmt).scalar() or 0)


def _retrieval_scope_diagnostics(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    include_inactive: bool,
) -> dict[str, Any]:
    today = date.today()
    base_conditions = [
        DocumentChunk.organization_id == organization_id,
        DocumentChunk.chatbot_id == chatbot_id,
        Document.organization_id == organization_id,
        Document.chatbot_id == chatbot_id,
        DocumentVersion.organization_id == organization_id,
        DocumentVersion.chatbot_id == chatbot_id,
    ]
    searchable_conditions = [
        *base_conditions,
        Document.status == "active",
        DocumentVersion.status == "completed",
        DocumentVersion.is_active.is_(True),
        DocumentVersion.is_search_suppressed.is_(False),
        or_(DocumentVersion.effective_date.is_(None), DocumentVersion.effective_date <= today),
        or_(DocumentVersion.expiration_date.is_(None), DocumentVersion.expiration_date >= today),
    ]
    excluded_by_reason = {
        "documentInactive": _count_chunks(db, *base_conditions, Document.status != "active"),
        "versionNotCompleted": _count_chunks(db, *base_conditions, DocumentVersion.status != "completed"),
        "versionInactive": _count_chunks(db, *base_conditions, DocumentVersion.is_active.is_not(True)),
        "searchSuppressed": _count_chunks(db, *base_conditions, DocumentVersion.is_search_suppressed.is_(True)),
        "dateWindow": _count_chunks(
            db,
            *base_conditions,
            or_(
                DocumentVersion.effective_date > today,
                DocumentVersion.expiration_date < today,
            ),
        ),
    }
    total = _count_chunks(db, *base_conditions)
    searchable = total if include_inactive else _count_chunks(db, *searchable_conditions)
    return {
        "matchedOrganizationId": organization_id,
        "matchedChatbotId": chatbot_id,
        "totalChunkCount": total,
        "searchableChunkCount": searchable,
        "excludedChunkCountByReason": excluded_by_reason,
        "includeInactive": include_inactive,
    }


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
    rag_settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    started_at = time.perf_counter()
    normalized = normalize_query(question)
    tokens = _normalize_token_variants(_tokenize(normalized))
    _top_k = _rag_int(rag_settings, "topK", top_k, minimum=1, maximum=20)
    _threshold_doc = _rag_float(
        rag_settings,
        "retrievalThresholdDocument",
        _float_env("RETRIEVAL_THRESHOLD_DOCUMENT", 0.28),
    )
    _threshold_web = _rag_float(
        rag_settings,
        "retrievalThresholdWebsite",
        _float_env("RETRIEVAL_THRESHOLD_WEBSITE", 0.25),
    )
    _threshold_faq = _rag_float(
        rag_settings,
        "retrievalThresholdFaq",
        _float_env("RETRIEVAL_THRESHOLD_FAQ", 0.22),
    )

    synonyms = list_active_synonyms(db, organization_id, chatbot_id)
    expanded_tokens = _normalize_token_variants(_expand_tokens(tokens, synonyms))
    scope_diagnostics = _retrieval_scope_diagnostics(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        include_inactive=include_inactive,
    )
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
            scope_diagnostics=scope_diagnostics,
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
            limit_count=max(50, _top_k * 8),
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
            scope_diagnostics=scope_diagnostics,
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
            (keyword_score * 0.25)
            + ((vector_score or 0.0) * 0.55)
            + (corpus_signal * 0.05)
            + (source_signal * 0.05)
            + (version_signal * 0.05)
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
        noise_text = f"{section_title or ''} {text_preview} {source_url or ''}"
        keyword_boost, boosted_terms = _policy_keyword_boost(normalized, boost_text)
        noise_penalty, noise_penalty_terms = _noise_section_penalty(noise_text)
        score_before_quality_adjustments = combined_score
        if keyword_boost:
            combined_score = round(min(combined_score + keyword_boost, 1.0), 4)
        if noise_penalty:
            combined_score = round(max(combined_score - noise_penalty, 0.0), 4)
        combined_score, semantic_evidence_applied, semantic_evidence_reason = _semantic_evidence_adjustment(
            vector_score=vector_score,
            keyword_score=keyword_score,
            combined_score=combined_score,
            source_type=version.source_type,
        )
        combined_score = round(combined_score, 4)
        citation_eligible = not (bool(noise_penalty) and combined_score < 0.50)

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
                "noisePenaltyApplied": bool(noise_penalty),
                "noisePenaltyValue": noise_penalty,
                "noisePenaltyTerms": noise_penalty_terms,
                "scoreBeforeQualityAdjustments": score_before_quality_adjustments,
                "semanticEvidenceApplied": semantic_evidence_applied,
                "semanticEvidenceReason": semantic_evidence_reason,
                "semanticRescued": False,
                "citationEligible": citation_eligible,
                "sectionDuplicateSkipped": False,
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
    )[:_top_k]

    for index, item in enumerate(ranked, start=1):
        item["finalRank"] = index
        item["dynamicThreshold"] = _dynamic_threshold_for_candidate(
            item,
            question=question,
            threshold_doc=_threshold_doc,
            threshold_web=_threshold_web,
            threshold_faq=_threshold_faq,
        )
        item["rescuedByTop1Rule"] = False

    (
        prompt_candidates,
        source_diversity_applied,
        rescued_by_top1_rule,
        section_diversity_applied,
        semantic_rescued,
    ) = _apply_prompt_selection(
        ranked,
        threshold=min(_threshold_doc, _threshold_web, _threshold_faq),
        threshold_doc=_threshold_doc,
        threshold_web=_threshold_web,
        threshold_faq=_threshold_faq,
        question=question,
        prompt_limit=MAX_PROMPT_CHUNKS,
    )
    keyword_boost_applied = any(bool(item.get("keywordBoostApplied")) for item in ranked)
    noise_penalty_applied = any(bool(item.get("noisePenaltyApplied")) for item in ranked)
    semantic_evidence_applied = any(bool(item.get("semanticEvidenceApplied")) for item in ranked)
    overview_rescued = any(bool(item.get("overviewRescued")) for item in ranked)
    noise_penalty_terms = sorted(
        {term for item in ranked for term in list(item.get("noisePenaltyTerms") or [])}
    )
    dynamic_threshold = min((float(item.get("dynamicThreshold") or threshold) for item in ranked), default=threshold)
    citation_candidates = [
        item
        for item in prompt_candidates
        if bool(item.get("citationEligible", True))
    ]

    return {
        "normalizedQuery": normalized,
        "expandedTokens": expanded_tokens,
        "candidates": ranked,
        "promptCandidates": prompt_candidates,
        "citationCandidates": citation_candidates,
        "retrievalThreshold": dynamic_threshold,
        "baseRetrievalThreshold": threshold,
        "usedInPromptCount": len(prompt_candidates),
        "retrievedCount": len(ranked),
        "sourceDiversityApplied": source_diversity_applied,
        "sectionDiversityApplied": section_diversity_applied,
        "queryEmbeddingGenerated": True,
        "queryEmbeddingLength": query_embedding_length,
        "queryEmbeddingType": query_embedding_type,
        "scopeDiagnostics": scope_diagnostics,
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
            "sectionDiversityApplied": section_diversity_applied,
            "rescuedByTop1Rule": rescued_by_top1_rule,
            "keywordBoostApplied": keyword_boost_applied,
            "noisePenaltyApplied": noise_penalty_applied,
            "noisePenaltyTerms": noise_penalty_terms,
            "semanticEvidenceApplied": semantic_evidence_applied,
            "semanticRescued": semantic_rescued,
            "overviewQueryDetected": _is_overview_query(question),
            "overviewRescued": overview_rescued,
            "finalPromptChunkCount": len(prompt_candidates),
            "promptChunkCount": len(prompt_candidates),
            "scopeDiagnostics": scope_diagnostics,
            "searchableChunkCount": scope_diagnostics.get("searchableChunkCount"),
            "excludedChunkCountByReason": scope_diagnostics.get("excludedChunkCountByReason", {}),
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
    rag_settings: dict[str, Any] | None = None,
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
        rag_settings=rag_settings,
    )
