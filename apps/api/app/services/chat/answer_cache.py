"""시맨틱 답변 캐시 — 동일 1턴 질문 반복 시 LLM 우회.

USE_ANSWER_CACHE=true 일 때만 활성화. Redis 가용 시 인스턴스 간 공유, 미가용 시 in-memory.

캐시 키: answer_cache:v1:{chatbot_id}:{sha256(normalized_question)}
TTL: settings.answer_cache_ttl_seconds (기본 600s = 10분). 무효화는 TTL만 사용.

캐시되는 응답 필드:
- answerText: str
- citations: list[dict]   (Pydantic 직렬화된 ChatCitation)
- followUpQuestions: list[str]
- outcome: str
- structuredResponse: dict | None

스킵 조건(절대 캐시 안 함):
- 멀티턴(recent_messages가 비어있지 않음)
- outcome != "answered"
- 개인정보 차단 케이스
- guardrail이 경고/주의 표현 요구하는 경우(상황별 변동)
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

from app.core import cache as _cache
from app.core.config import settings

logger = logging.getLogger(__name__)

_KEY_PREFIX = "answer_cache:v1:"
_WHITESPACE_RE = re.compile(r"\s+")


def is_enabled() -> bool:
    return bool(settings.use_answer_cache)


def _normalize_question(text: str) -> str:
    """캐시 키 일관성: 공백 정규화 + 양끝 트림."""
    if not text:
        return ""
    return _WHITESPACE_RE.sub(" ", text.strip())


def build_cache_key(chatbot_id: str, question: str) -> str:
    normalized = _normalize_question(question)
    digest = hashlib.sha256(f"{chatbot_id}\x00{normalized}".encode()).hexdigest()
    return f"{_KEY_PREFIX}{chatbot_id}:{digest}"


def should_skip(
    *,
    recent_messages: list[Any] | None,
    outcome: str | None = None,
    privacy_blocked: bool = False,
    requires_cautious_wording: bool = False,
) -> tuple[bool, str | None]:
    """캐시 조회/저장 양쪽에서 스킵 여부 판정. (skip, reason)."""
    if not is_enabled():
        return True, "disabled"
    if recent_messages:
        # 1턴이 아니면 컨텍스트 의존 가능성 → 스킵
        return True, "multiturn"
    if privacy_blocked:
        return True, "privacy"
    if requires_cautious_wording:
        return True, "cautious"
    if outcome is not None and outcome != "answered":
        return True, f"outcome={outcome}"
    return False, None


def get_cached(chatbot_id: str, question: str) -> dict[str, Any] | None:
    """캐시 조회. 미스/만료/비활성 시 None."""
    if not is_enabled():
        return None
    if not chatbot_id or not question:
        return None
    key = build_cache_key(chatbot_id, question)
    cached = _cache.get(key)
    if cached is None:
        return None
    if not isinstance(cached, dict) or "answerText" not in cached:
        return None
    logger.info(
        "[ANSWER_CACHE_HIT] chatbot_id=%s question_len=%s",
        chatbot_id, len(question),
    )
    return cached


def store(
    chatbot_id: str,
    question: str,
    *,
    answer_text: str,
    outcome: str,
    citations: list[dict] | None,
    follow_up_questions: list[str] | None,
    structured_response: dict | None,
) -> None:
    """답변 캐시 저장. 비활성/빈값/오류 시 silent skip."""
    if not is_enabled():
        return
    if not chatbot_id or not question or not answer_text:
        return
    if outcome != "answered":
        return
    key = build_cache_key(chatbot_id, question)
    value: dict[str, Any] = {
        "answerText": answer_text,
        "outcome": outcome,
        "citations": citations or [],
        "followUpQuestions": follow_up_questions or [],
        "structuredResponse": structured_response,
    }
    try:
        _cache.set(key, value, settings.answer_cache_ttl_seconds)
        logger.info(
            "[ANSWER_CACHE_STORE] chatbot_id=%s question_len=%s ttl=%ss",
            chatbot_id, len(question), settings.answer_cache_ttl_seconds,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[ANSWER_CACHE_STORE_FAILED] chatbot_id=%s error=%s", chatbot_id, exc)


def invalidate_chatbot(chatbot_id: str) -> int:
    """챗봇 단위로 모든 답변 캐시 무효화. 지식/FAQ 변경 시 호출(현재는 미사용)."""
    if not chatbot_id:
        return 0
    prefix = f"{_KEY_PREFIX}{chatbot_id}:"
    count = _cache.delete_prefix(prefix)
    if count:
        logger.info("[ANSWER_CACHE_INVALIDATE] chatbot_id=%s deleted=%s", chatbot_id, count)
    return count
