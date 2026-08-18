"""검색이 '못 찾은 것'과 '아예 못 돈 것'을 구분해 안내한다.

OpenAI 크레딧이 바닥나 임베딩이 실패했을 때 챗봇이 "등록된 자료에서 관련
근거를 찾지 못했습니다"라고 답했다. 담당자는 없는 문제를 찾아 자료를
뒤졌고, 원인이 결제라는 걸 알기까지 한참 걸렸다.

장애는 자료 탓이 아니다.
"""

from app.schemas.answer_settings import AnswerSettings
from app.services.chat.fallback_response_service import (
    DEFAULT_LOW_EVIDENCE_MESSAGE,
    SERVICE_UNAVAILABLE_MESSAGE,
    build_fallback_response,
)

POLICY = {"decision": "insufficient_evidence", "recommendedAction": "fallback"}


def _settings() -> AnswerSettings:
    return AnswerSettings()


def test_임베딩_실패는_장애로_안내한다():
    result = build_fallback_response(
        policy_decision=POLICY,
        answer_settings=_settings(),
        retrieval_failure_reason="EMBEDDING_FAILED",
    )

    assert result["text"] == SERVICE_UNAVAILABLE_MESSAGE
    assert "자료" not in result["text"] or "등록된 자료에서" not in result["text"]
    assert result["outcome"] == "escalate"
    assert "RETRIEVAL_SERVICE_UNAVAILABLE" in result["warnings"]


def test_검색_오류도_장애로_안내한다():
    result = build_fallback_response(
        policy_decision=POLICY,
        answer_settings=_settings(),
        retrieval_failure_reason="RETRIEVAL_ERROR",
    )

    assert result["text"] == SERVICE_UNAVAILABLE_MESSAGE


def test_진짜_자료_부족은_기존_안내를_그대로_쓴다():
    """장애가 아닌 경우까지 장애 안내로 덮으면 정반대 오해가 생긴다."""
    result = build_fallback_response(
        policy_decision=POLICY,
        answer_settings=_settings(),
        retrieval_failure_reason=None,
    )

    assert result["text"] != SERVICE_UNAVAILABLE_MESSAGE
    assert result["outcome"] == "insufficient_evidence"


def test_임계값_미달은_자료_부족이다():
    """검색은 돌았고 점수가 낮았을 뿐이다 — 이건 자료 문제가 맞다."""
    result = build_fallback_response(
        policy_decision=POLICY,
        answer_settings=_settings(),
        retrieval_failure_reason="LOW_SCORE",
    )

    assert result["text"] != SERVICE_UNAVAILABLE_MESSAGE


def test_기본_자료부족_문구가_비어있지_않다():
    result = build_fallback_response(policy_decision=POLICY, answer_settings=_settings())

    assert result["text"]
    assert result["text"] in (
        DEFAULT_LOW_EVIDENCE_MESSAGE,
        _settings().answer_policy.fallback_message_when_insufficient_evidence,
    )


def test_장애_안내는_질문을_고치라고_하지_않는다():
    """'질문을 더 구체적으로'는 장애 상황에서 이용자를 헛돌게 만든다."""
    text = SERVICE_UNAVAILABLE_MESSAGE

    assert "구체적" not in text
    assert "다시 시도" in text
