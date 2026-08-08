"""AI 답변 품질 자동 평가.

원자료(chat_messages)는 이미 다 쌓이고 있어 평가 레이어만 얹는다.
LLM 호출은 모킹하고, 순수 함수의 판정·집계 로직을 고정한다.
"""

from app.schemas.answer_settings import AnswerSettings


def test_quality_evaluation_is_disabled_by_default() -> None:
    """기본 꺼짐 — 켜지 않은 기관에는 비용이 발생하지 않아야 한다."""
    assert AnswerSettings().answer_policy.quality_evaluation_enabled is False


def test_quality_evaluation_can_be_enabled() -> None:
    settings = AnswerSettings()
    settings.answer_policy.quality_evaluation_enabled = True
    assert settings.answer_policy.quality_evaluation_enabled is True
