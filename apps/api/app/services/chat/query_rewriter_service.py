"""
쿼리 리라이팅 서비스 (Sprint 2-A).

멀티턴 대화에서 대명사·지시어가 포함된 후속 질문을
검색에 최적화된 독립적 질문으로 재작성한다.

- settings.use_query_rewriting=true 일 때만 LLM 호출
- 실패·예외·짧은 이력 시 원본 쿼리 그대로 반환
- recent_messages 는 ORM 객체(role/content 속성) 또는 dict 모두 처리
"""

import logging
import re
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── 후속 질문 감지 패턴 ───────────────────────────────────────────────────────
_FOLLOWUP_PATTERNS = [
    r"그거|그것|그 것",
    r"아까|앞에서|위에서|방금",
    r"더 자세히|좀 더|더 알려|추가로|자세하게",
    r"^.{1,15}[?？]$",
    r"어떻게 되|뭐야|뭔가요|뭔지",
    r"거기|거기서|그쪽|그곳",
    r"^(그|이|저|저것|이것|그게|이게)[ ]+",
]

_REWRITE_TIMEOUT_SEC = 8


def _field(msg: Any, key: str) -> str:
    """ORM 객체와 dict 모두 처리."""
    if isinstance(msg, dict):
        return str(msg.get(key) or "")
    return str(getattr(msg, key, "") or "")


def needs_rewriting(query: str, history: list[Any]) -> bool:
    """후속 질문 패턴이 감지되고 이전 대화가 충분할 때 True."""
    if not history or len(history) < 2:
        return False
    return any(re.search(p, query) for p in _FOLLOWUP_PATTERNS)


def rewrite_query(
    current_query: str,
    recent_messages: list[Any],
    db: Any,
) -> tuple[str, bool]:
    """
    멀티턴 맥락 기반 쿼리 리라이팅.

    반환: (리라이팅된 쿼리 또는 원본, 리라이팅 발생 여부)
    - settings.use_query_rewriting=False → (current_query, False)
    - 후속 질문 패턴 미감지 → (current_query, False)
    - LLM 실패·예외 → (current_query, False)
    - 정상 → (rewritten, True)
    """
    if not settings.use_query_rewriting:
        return current_query, False

    if not needs_rewriting(current_query, recent_messages):
        return current_query, False

    # 최근 4개 메시지, 각 200자 이내
    history_lines: list[str] = []
    for msg in recent_messages[-4:]:
        role = _field(msg, "role")
        content = _field(msg, "content")[:200]
        if role == "user":
            history_lines.append(f"사용자: {content}")
        elif role == "assistant":
            history_lines.append(f"AI: {content}")

    if not history_lines:
        return current_query, False

    formatted_history = "\n".join(history_lines)
    system = "질문 리라이팅 전문가입니다. 리라이팅된 질문 하나만 출력하세요. 설명 없이."
    user = (
        "대화 이력을 참고해서 마지막 질문을 검색에 최적화된\n"
        "독립적인 한국어 질문으로 재작성하세요.\n"
        "대명사(그것, 아까 등)를 구체적인 명사로 바꾸세요.\n"
        "질문 하나만 출력하세요.\n\n"
        f"대화 이력:\n{formatted_history}\n\n"
        f"마지막 질문: {current_query}"
    )

    try:
        rewritten = _call_llm(db, system=system, user=user)
    except Exception as exc:
        logger.warning("[QUERY_REWRITE] LLM 호출 실패: %s", exc)
        return current_query, False

    if not rewritten:
        return current_query, False

    # 원본보다 3배 이상 길면 비정상 응답으로 간주
    if len(rewritten) > len(current_query) * 3:
        logger.warning("[QUERY_REWRITE] 리라이팅 결과가 너무 길어 원본 사용: %s", rewritten[:80])
        return current_query, False

    logger.info("[QUERY_REWRITE] '%s' → '%s'", current_query[:40], rewritten[:40])
    return rewritten.strip(), True


# ── 긍정 답변("네") → 직전 제안 이어받기 ──────────────────────────────────────
_AFFIRMATION_COMPACT = {
    "네", "넹", "넵", "예", "엡", "응", "웅", "ㅇㅇ", "ㅇㅋ", "그래", "그래요", "그러죠",
    "그럼", "좋아", "좋아요", "좋습니다", "좋네요", "예스", "yes", "yep", "yeah", "ok",
    "okay", "오케이", "콜", "알려줘", "알려주세요", "알려줘요", "설명해줘", "설명해주세요",
    "부탁해", "부탁해요", "부탁드려요", "부탁드립니다", "해줘", "해주세요", "계속",
    "계속해줘", "계속해주세요", "이어서", "이어서알려줘", "네알려줘", "네알려주세요",
    "네부탁해요", "응알려줘", "그래알려줘", "네좋아요", "응응", "넵부탁드려요",
}

_OFFER_PATTERN = re.compile(
    r"(안내|설명|소개|정리|알려)\s*해?\s*(드릴까요|드릴게요|드리겠습니다|줄까요|줄게요)"
    r"|이어서|원하시면|더 알려드릴|추가(로)?\s*안내"
)


def _compact_affirm(text: str) -> str:
    return re.sub(r"[\s.!?。！？~^]+", "", text.strip().lower())


def is_affirmation(query: str) -> bool:
    """짧은 긍정/동의 표현인지 판별 ("네", "응 알려줘" 등)."""
    compact = _compact_affirm(query)
    return bool(compact) and len(compact) <= 12 and compact in _AFFIRMATION_COMPACT


def resolve_affirmation_followup(
    current_query: str,
    recent_messages: list[Any],
    db: Any,
) -> tuple[str, bool]:
    """
    "네/응/알려줘" 같은 긍정 답변이 직전 AI의 '…안내해 드릴까요?' 제안을 가리키면,
    그 제안 주제를 사용자가 직접 묻는 독립 질문으로 복원한다.

    반환: (복원된 질문 또는 원본, 복원 여부)
    - use_query_rewriting=False → 비활성
    - 긍정어 아님 / 직전 AI 제안 없음 / LLM 실패 → (current_query, False)
    """
    if not settings.use_query_rewriting:
        return current_query, False
    if not is_affirmation(current_query) or not recent_messages:
        return current_query, False

    last_assistant = ""
    for msg in reversed(recent_messages):
        if _field(msg, "role") == "assistant":
            last_assistant = _field(msg, "content")
            break
    # 직전 AI가 '이어서 안내할까요?'식 제안을 했을 때만 동작 (오발동 방지)
    if not last_assistant or not _OFFER_PATTERN.search(last_assistant):
        return current_query, False

    system = "질문 생성기입니다. 질문 하나만 출력하세요. 설명 없이."
    user = (
        "직전 AI 답변이 사용자에게 '이어서 안내해 드릴까요?'라고 제안했고,\n"
        "사용자가 동의했습니다. 그 제안한 주제를 사용자가 직접 묻는 것처럼\n"
        "독립적인 한국어 질문 하나로 만들어주세요. 질문 하나만 출력하세요.\n\n"
        f"직전 AI 답변:\n{last_assistant[:600]}\n\n"
        f"사용자 동의: {current_query}"
    )

    try:
        rewritten = _call_llm(db, system=system, user=user)
    except Exception as exc:
        logger.warning("[AFFIRM_REWRITE] LLM 호출 실패: %s", exc)
        return current_query, False

    if not rewritten:
        return current_query, False
    rewritten = rewritten.strip().strip('"').strip()
    if len(rewritten) < 4 or len(rewritten) > 100:
        return current_query, False

    logger.info("[AFFIRM_REWRITE] '%s' → '%s'", current_query, rewritten[:50])
    return rewritten, True


# ── LLM 호출 헬퍼 — answer_generation_service 공유 ──────────────────────────


def _call_llm(db: Any, *, system: str, user: str) -> str:
    """프로젝트 표준 LLM 호출. 응답 텍스트 반환. 실패 시 빈 문자열 반환."""
    from app.services.chat.answer_generation_service import (  # noqa: PLC0415
        _call_anthropic,
        _call_openai_like,
        _extract_output_text_anthropic,
        _extract_output_text_openai,
    )
    from app.services.llm_api_config_runtime_service import (  # noqa: PLC0415
        resolve_runtime_api_config as _resolve,
    )

    runtime_api = _resolve(db)
    if runtime_api is None:
        logger.warning("[QUERY_REWRITE] no runtime API config")
        return ""

    model = runtime_api.speed_model()  # 쿼리 리라이팅: 속도 우선

    if runtime_api.provider == "anthropic":
        response_json = _call_anthropic(
            api_key=runtime_api.api_key,
            base_url=runtime_api.base_url,
            model=model,
            temperature=0,
            max_output_tokens=128,
            top_p=None,
            system_prompt=system,
            user_prompt=user,
            timeout_seconds=_REWRITE_TIMEOUT_SEC,
        )
        return _extract_output_text_anthropic(response_json).strip()

    response_json = _call_openai_like(
        provider=runtime_api.provider,
        api_key=runtime_api.api_key,
        base_url=runtime_api.base_url,
        model=model,
        temperature=0,
        max_output_tokens=128,
        top_p=None,
        frequency_penalty=None,
        presence_penalty=None,
        system_prompt=system,
        user_prompt=user,
        timeout_seconds=_REWRITE_TIMEOUT_SEC,
    )
    return _extract_output_text_openai(response_json).strip()
