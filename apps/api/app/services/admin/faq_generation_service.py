"""
faq_generation_service.py
등록된 문서 청크를 분석해서 FAQ Q&A 쌍을 LLM으로 자동 생성.

2단계 파이프라인:
  Phase 1 - 전체 청크 샘플링 → LLM이 주제 클러스터(category/field 포함) 추출
  Phase 2 - 주제별 관련 청크 선택 → 병렬 FAQ 생성
생성된 FAQ는 관리자 검수 후 faq_items 테이블에 등록.
"""
from __future__ import annotations

import concurrent.futures
import json
import logging
import re

from sqlalchemy.orm import Session

from app.services.chat.answer_generation_service import (
    _call_anthropic,
    _call_openai_like,
    _extract_output_text_anthropic,
    _extract_output_text_openai,
)
from app.services.llm_api_config_runtime_service import resolve_runtime_api_config

logger = logging.getLogger(__name__)

# ── 상수 ───────────────────────────────────────────────────────────────────────
_TOPIC_SAMPLE_CHARS_PER_CHUNK = 200   # 주제 분석용 청크 샘플 길이
_TOPIC_MAX_TOTAL_CHARS = 6000         # 주제 분석 프롬프트 최대 길이
_FAQ_CHUNK_CHARS = 600                # FAQ 생성 시 청크당 최대 길이
_FAQ_MAX_CONTEXT_CHARS = 4000         # FAQ 생성 프롬프트 최대 길이

# ── 프롬프트: 주제 추출 ────────────────────────────────────────────────────────
_TOPIC_EXTRACTION_SYSTEM = """당신은 공공기관 문서를 분석해 핵심 주제를 추출하는 전문가입니다.
문서 청크 샘플을 보고 사용자가 자주 질문할 주요 주제 클러스터를 파악하세요.

규칙:
1. 문서 내용에 존재하는 주제만 추출 (추측 금지)
2. 각 주제는 독립적이고 실질적 내용을 가져야 함
3. 너무 세부적이거나 너무 광범위하지 않게
4. 반드시 JSON 배열만 반환"""

_TOPIC_EXTRACTION_USER = """다음은 문서 "{title}"의 청크 샘플입니다.

[문서 청크 샘플]
{chunk_samples}

이 문서에서 사용자가 자주 질문할 {max_topics}개 내외의 핵심 주제를 추출하세요.
각 주제에 대해 대분류(category)와 소분류(field)도 제안하세요.

아래 JSON 형식으로만 응답하세요:
[
  {{
    "topic": "주제명 (10자 이내)",
    "description": "이 주제의 핵심 내용 1문장",
    "category": "대분류 (예: 신청 안내, 사업 소개, 지원 내용)",
    "field": "소분류 (예: 신청 자격, 신청 기간, 지원 금액)",
    "chunk_indices": [0, 2, 5]
  }}
]"""

# ── 프롬프트: 주제별 FAQ 생성 ──────────────────────────────────────────────────
_FAQ_PER_TOPIC_SYSTEM = """당신은 공공기관 챗봇용 FAQ를 작성하는 전문가입니다.
주어진 주제와 문서 내용을 기반으로 시민이 실제로 자주 물어볼 질문과 답변을 생성하세요.

규칙:
1. 반드시 문서 내용에 근거한 질문만 생성
2. 질문은 시민 관점에서 자연스러운 구어체
3. 답변은 문서 내용을 그대로 활용 (2~4문장)
4. 추측하거나 없는 내용 생성 절대 금지
5. 반드시 JSON 배열만 반환 (다른 텍스트 없이)"""

_FAQ_PER_TOPIC_USER = """문서: "{title}"
주제: "{topic}" — {description}

[관련 문서 내용]
{content}

위 주제와 관련한 FAQ {count}개를 생성하세요.
태그(tags)는 질문과 관련된 핵심 키워드 2~4개를 제안하세요.

아래 JSON 형식으로만 응답하세요:
[
  {{
    "question": "질문 내용",
    "answer": "답변 내용",
    "tags": ["태그1", "태그2"]
  }}
]"""

# ── 기존 단순 생성 (하위 호환) ────────────────────────────────────────────────
_FAQ_GENERATION_SYSTEM_PROMPT = """
당신은 공공기관 챗봇용 FAQ를 작성하는 전문가입니다.
주어진 문서 내용을 분석해서 시민/사용자가 자주 물어볼 만한
질문과 답변 쌍을 생성하세요.

규칙:
1. 실제 문서 내용에 근거한 질문만 생성
2. 질문은 시민 관점에서 자연스러운 구어체
3. 답변은 문서 내용을 그대로 활용, 2~4문장
4. 추측하거나 없는 내용 생성 금지
5. 반드시 JSON 배열만 반환 (다른 텍스트 없이)
""".strip()

_FAQ_GENERATION_USER_TEMPLATE = """
아래 문서 내용을 분석해서 FAQ {count}개를 생성하세요.

[문서 내용]
{content}

아래 JSON 형식으로만 응답하세요:
[
  {{"question": "질문 내용", "answer": "답변 내용"}},
  ...
]
"""


def _parse_json_list(raw_text: str) -> list[dict]:
    """LLM 응답에서 JSON 배열 파싱. 마크다운 코드블록 자동 제거."""
    if not raw_text:
        return []
    clean = raw_text.strip()
    # ```json ... ``` 또는 ``` ... ``` 제거
    clean = re.sub(r"^```(?:json)?\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean)
    clean = clean.strip()
    try:
        result = json.loads(clean)
        return result if isinstance(result, list) else []
    except json.JSONDecodeError:
        # JSON 블록만 추출 재시도
        match = re.search(r"\[[\s\S]*\]", clean)
        if match:
            try:
                result = json.loads(match.group())
                return result if isinstance(result, list) else []
            except json.JSONDecodeError:
                pass
    return []


def _call_llm(runtime_api, system_prompt: str, user_prompt: str, max_tokens: int = 2000) -> str:
    """LLM 호출 공통 헬퍼. 응답 텍스트 반환, 실패 시 빈 문자열."""
    try:
        if runtime_api.provider == "anthropic":
            resp = _call_anthropic(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=runtime_api.quality_model(),
                temperature=0.2,
                max_output_tokens=max_tokens,
                top_p=None,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
            return _extract_output_text_anthropic(resp) or ""
        else:
            resp = _call_openai_like(
                provider=runtime_api.provider,
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=runtime_api.quality_model(),
                temperature=0.2,
                max_output_tokens=max_tokens,
                top_p=None,
                frequency_penalty=None,
                presence_penalty=None,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
            return _extract_output_text_openai(resp) or ""
    except Exception as exc:
        logger.warning("[FAQ_LLM] call failed: %s", exc)
        return ""


def _build_chunk_samples(chunk_texts: list[str]) -> tuple[str, int]:
    """
    전체 청크에서 주제 분석용 샘플 텍스트를 구성.
    반환: (샘플 텍스트, 실제 포함된 청크 수)
    """
    samples: list[str] = []
    total_chars = 0
    for i, text in enumerate(chunk_texts):
        if total_chars >= _TOPIC_MAX_TOTAL_CHARS:
            break
        snippet = text.strip()[:_TOPIC_SAMPLE_CHARS_PER_CHUNK]
        if not snippet:
            continue
        line = f"[청크 {i}] {snippet}"
        samples.append(line)
        total_chars += len(line)
    return "\n\n".join(samples), len(samples)


def _extract_topics(
    runtime_api,
    document_title: str,
    chunk_texts: list[str],
    max_topics: int = 6,
) -> list[dict]:
    """
    Phase 1: 전체 청크 샘플에서 주요 주제 클러스터를 LLM으로 추출.
    반환: [{topic, description, category, field, chunk_indices}, ...]
    """
    chunk_samples, included = _build_chunk_samples(chunk_texts)
    if not chunk_samples:
        return []

    user_prompt = _TOPIC_EXTRACTION_USER.format(
        title=document_title,
        chunk_samples=chunk_samples,
        max_topics=max_topics,
    )
    raw = _call_llm(runtime_api, _TOPIC_EXTRACTION_SYSTEM, user_prompt, max_tokens=1200)
    topics = _parse_json_list(raw)

    validated: list[dict] = []
    for t in topics:
        if not (t.get("topic") and t.get("description")):
            continue
        # chunk_indices 정규화 — 유효 범위 안의 인덱스만 유지
        raw_indices = t.get("chunk_indices") or []
        indices = sorted({int(i) for i in raw_indices if isinstance(i, int | float) and 0 <= int(i) < len(chunk_texts)})
        validated.append({
            "topic":       str(t.get("topic", "")).strip()[:30],
            "description": str(t.get("description", "")).strip(),
            "category":    str(t.get("category", "")).strip() or None,
            "field":       str(t.get("field", "")).strip() or None,
            "chunk_indices": indices,
        })

    logger.info(
        "[FAQ_ANALYZE] title=%s total_chunks=%d sampled=%d topics_found=%d",
        document_title[:40], len(chunk_texts), included, len(validated),
    )
    return validated[:max_topics]


def _select_chunks_for_topic(chunk_texts: list[str], chunk_indices: list[int]) -> str:
    """주제에 관련된 청크를 연결해 컨텍스트 문자열 반환."""
    # chunk_indices가 비어있으면 전체에서 균등 샘플
    if not chunk_indices:
        step = max(1, len(chunk_texts) // 5)
        chunk_indices = list(range(0, len(chunk_texts), step))[:5]

    parts: list[str] = []
    total = 0
    for idx in chunk_indices:
        if idx >= len(chunk_texts):
            continue
        text = chunk_texts[idx].strip()[:_FAQ_CHUNK_CHARS]
        if total + len(text) > _FAQ_MAX_CONTEXT_CHARS:
            break
        parts.append(text)
        total += len(text)
    return "\n\n".join(parts)


def _generate_faqs_for_topic(
    runtime_api,
    document_title: str,
    topic: dict,
    chunk_texts: list[str],
    faqs_per_topic: int = 2,
) -> list[dict]:
    """
    Phase 2: 단일 주제에 대해 FAQ를 생성.
    반환: [{question, answer, tags, topic, category, field}, ...]
    """
    context = _select_chunks_for_topic(chunk_texts, topic.get("chunk_indices", []))
    if not context:
        return []

    user_prompt = _FAQ_PER_TOPIC_USER.format(
        title=document_title,
        topic=topic["topic"],
        description=topic["description"],
        content=context,
        count=faqs_per_topic,
    )
    raw = _call_llm(runtime_api, _FAQ_PER_TOPIC_SYSTEM, user_prompt, max_tokens=800)
    items = _parse_json_list(raw)

    result: list[dict] = []
    for item in items:
        q = str(item.get("question", "")).strip()
        a = str(item.get("answer", "")).strip()
        if not (q and a):
            continue
        tags_raw = item.get("tags") or []
        tags = [str(t).strip() for t in tags_raw if str(t).strip()][:4]
        result.append({
            "question": q,
            "answer":   a,
            "tags":     tags,
            "topic":    topic["topic"],
            "category": topic.get("category"),
            "field":    topic.get("field"),
        })
    return result


def analyze_and_generate_faq(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    knowledge_id: str,
    document_title: str,
    chunk_texts: list[str],
    max_topics: int = 6,
    faqs_per_topic: int = 2,
) -> dict:
    """
    2단계 파이프라인으로 FAQ 제안을 생성.

    반환:
    {
      "topics": [
        {
          "topic": "주제명",
          "description": "...",
          "category": "대분류",
          "field": "소분류",
          "chunk_indices": [...],
          "faqs": [{"question", "answer", "tags", "topic", "category", "field"}, ...]
        }
      ],
      "total_faqs": int,
    }
    실패 시 {"topics": [], "total_faqs": 0}.
    """
    if not chunk_texts:
        return {"topics": [], "total_faqs": 0}

    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        logger.warning("[FAQ_ANALYZE] no LLM config knowledge_id=%s", knowledge_id)
        return {"topics": [], "total_faqs": 0}

    # Phase 1: 주제 추출
    topics = _extract_topics(runtime_api, document_title, chunk_texts, max_topics=max_topics)
    if not topics:
        logger.warning("[FAQ_ANALYZE] no topics extracted knowledge_id=%s", knowledge_id)
        return {"topics": [], "total_faqs": 0}

    # Phase 2: 주제별 FAQ 생성 (병렬)
    def _gen_topic(topic: dict) -> dict:
        faqs = _generate_faqs_for_topic(
            runtime_api, document_title, topic, chunk_texts, faqs_per_topic=faqs_per_topic
        )
        return {**topic, "faqs": faqs}

    enriched_topics: list[dict] = []
    max_workers = min(len(topics), 4)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(_gen_topic, t) for t in topics]
        for future in concurrent.futures.as_completed(futures):
            try:
                enriched_topics.append(future.result())
            except Exception as exc:
                logger.warning("[FAQ_ANALYZE] topic generation failed: %s", exc)

    # 원래 주제 순서 복원 (as_completed는 순서 보장 안함)
    topic_order = {t["topic"]: i for i, t in enumerate(topics)}
    enriched_topics.sort(key=lambda t: topic_order.get(t["topic"], 999))

    total_faqs = sum(len(t["faqs"]) for t in enriched_topics)
    logger.info(
        "[FAQ_ANALYZE] knowledge_id=%s topics=%d total_faqs=%d",
        knowledge_id, len(enriched_topics), total_faqs,
    )
    return {"topics": enriched_topics, "total_faqs": total_faqs}


# ── 기존 단순 생성 (하위 호환 유지) ───────────────────────────────────────────
def generate_faq_from_chunks(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    knowledge_id: str,
    chunk_texts: list[str],
    faq_count: int = 5,
) -> list[dict[str, str]]:
    """
    청크 텍스트 목록에서 FAQ를 생성해 반환 (기존 단순 방식).
    반환: [{"question": "...", "answer": "..."}, ...]
    실패 시 빈 리스트 반환.
    """
    if not chunk_texts:
        return []

    faq_count = max(1, min(faq_count, 10))
    combined_content = "\n\n".join(chunk_texts)[:3000]

    user_prompt = _FAQ_GENERATION_USER_TEMPLATE.format(
        count=faq_count,
        content=combined_content,
    )

    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        logger.warning("[FAQ_GENERATION] no LLM config knowledge_id=%s", knowledge_id)
        return []

    raw_text = _call_llm(runtime_api, _FAQ_GENERATION_SYSTEM_PROMPT, user_prompt, max_tokens=1500)
    items = _parse_json_list(raw_text)

    return [
        {
            "question": str(item.get("question", "")).strip(),
            "answer":   str(item.get("answer", "")).strip(),
        }
        for item in items
        if item.get("question") and item.get("answer")
    ]
