"""평가 대상 선별. 순수 함수 — DB나 LLM을 모른다."""

from enum import Enum
from typing import Any


class SkipReason(str, Enum):
    NOT_ASSISTANT = "not_assistant"
    TEST_MESSAGE = "test_message"
    NOT_ANSWERED = "not_answered"
    SIMPLE_RESPONSE = "simple_response"
    CACHE_HIT = "cache_hit"


def _field(obj: Any, name: str, default: Any) -> Any:
    value = getattr(obj, name, None)
    return default if value is None else value


def should_evaluate(message: Any) -> SkipReason | None:
    """평가 대상이면 None, 아니면 제외 사유를 돌려준다.

    answered 가 아닌 건은 평가하지 않는다. 근거가 없어 "확인하기 어렵습니다"라고
    정직하게 답한 건을 품질 미달로 세면, 모르는 것을 아는 척할수록 점수가 오르는
    지표가 된다. 이관·정책차단도 답변 품질을 논할 대상이 아니다.
    """
    if _field(message, "role", "") != "assistant":
        return SkipReason.NOT_ASSISTANT
    if bool(_field(message, "is_test", False)):
        return SkipReason.TEST_MESSAGE

    decision = _field(message, "final_decision", {}) or {}
    if decision.get("outcome") != "answered":
        return SkipReason.NOT_ANSWERED
    if decision.get("reason") == "answer_cache_hit":
        return SkipReason.CACHE_HIT

    trace = (_field(message, "metadata_json", {}) or {}).get("trace") or {}
    if trace.get("simpleResponseApplied"):
        return SkipReason.SIMPLE_RESPONSE

    return None
