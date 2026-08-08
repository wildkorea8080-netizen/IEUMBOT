"""AI 답변 품질 자동 평가.

원자료(chat_messages)는 이미 다 쌓이고 있어 평가 레이어만 얹는다.
LLM 호출은 모킹하고, 순수 함수의 판정·집계 로직을 고정한다.
"""

from app.schemas.answer_settings import AnswerSettings
from app.services.quality.evaluation_selector import SkipReason, should_evaluate


def test_quality_evaluation_is_disabled_by_default() -> None:
    """기본 꺼짐 — 켜지 않은 기관에는 비용이 발생하지 않아야 한다."""
    assert AnswerSettings().answer_policy.quality_evaluation_enabled is False


def test_quality_evaluation_can_be_enabled() -> None:
    settings = AnswerSettings()
    settings.answer_policy.quality_evaluation_enabled = True
    assert settings.answer_policy.quality_evaluation_enabled is True


class _Msg:
    """ORM 대신 쓰는 최소 스텁. 선별 함수는 속성만 읽는다."""

    def __init__(self, **kw):
        self.role = kw.get("role", "assistant")
        self.is_test = kw.get("is_test", False)
        self.final_decision = kw.get("final_decision", {"outcome": "answered"})
        self.metadata_json = kw.get("metadata_json", {})


def test_answered_assistant_message_is_evaluated() -> None:
    assert should_evaluate(_Msg()) is None


def test_user_message_is_skipped() -> None:
    assert should_evaluate(_Msg(role="user")) is SkipReason.NOT_ASSISTANT


def test_test_message_is_skipped() -> None:
    assert should_evaluate(_Msg(is_test=True)) is SkipReason.TEST_MESSAGE


def test_non_answered_outcomes_are_skipped() -> None:
    """모르는 걸 정직하게 답한 건을 품질 미달로 세면, 아는 척할수록 점수가 오른다."""
    for outcome in ("insufficient_evidence", "escalate", "restricted"):
        msg = _Msg(final_decision={"outcome": outcome})
        assert should_evaluate(msg) is SkipReason.NOT_ANSWERED, outcome


def test_simple_greeting_is_skipped() -> None:
    msg = _Msg(metadata_json={"trace": {"simpleResponseApplied": True}})
    assert should_evaluate(msg) is SkipReason.SIMPLE_RESPONSE


def test_cache_hit_is_skipped() -> None:
    msg = _Msg(final_decision={"outcome": "answered", "reason": "answer_cache_hit"})
    assert should_evaluate(msg) is SkipReason.CACHE_HIT
