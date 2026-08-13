"""응답 톤·답변 길이 설정이 프롬프트에서 실제로 달라지는지 고정한다.

배경: 관리 화면의 세 가지 말투가 프롬프트에서는 제대로 갈리지 않았다.
특히 '간결한 안내형'(핵심 위주로 짧고 빠르게)이 "친근하고 이해하기 쉬운
말투로 답변하세요"로 매핑돼 있었다 — 간결함과 친근함은 다른 축이고,
짧게 쓰라는 지시가 어디에도 없었다. 고른 대로 동작하지 않는 설정이었다.

톤은 '어조', 답변 길이는 '분량'을 맡는다. 둘은 겹치지 않아야 조합이 된다
(간결한 어조 + 자세히 = 짧은 문장들로 자세히).
"""

from app.schemas.answer_settings import AnswerSettings
from app.services.chat.prompt_assembly_service import build_answer_prompt


def _prompt(*, tone: str | None = None, length: str | None = None) -> str:
    settings = AnswerSettings()
    if tone:
        settings.prompt_instruction.tone_mode = tone
    if length:
        settings.answer_format.max_answer_length_mode = length
    built = build_answer_prompt(
        question="신청 방법 알려주세요",
        normalized_query="신청 방법 알려주세요",
        candidates=[],
        settings=settings,
        requires_cautious_wording=False,
        requires_warning_notice=False,
    )
    return built["systemPrompt"]


def test_three_tones_produce_three_different_prompts() -> None:
    formal = _prompt(tone="formal")
    plain = _prompt(tone="plain")
    polite = _prompt(tone="polite")

    assert formal != plain != polite
    assert formal != polite


def test_concise_tone_actually_asks_for_brevity() -> None:
    # '간결한 안내형'은 plain으로 저장된다. 짧게 쓰라는 지시가 반드시 있어야 한다.
    prompt = _prompt(tone="plain")

    assert "짧" in prompt or "간결" in prompt
    # 예전처럼 '친근한 말투'로만 매핑되면 안 된다 — 길이와 무관한 지시다.
    assert "친근하고 이해하기 쉬운 말투로 답변하세요." not in prompt


def test_consultative_tone_asks_to_explain_why() -> None:
    # '친절한 상담형' 설명은 "부드럽고 설명적인" 이다.
    prompt = _prompt(tone="polite")

    assert "설명" in prompt


def test_formal_tone_forbids_casual_register() -> None:
    prompt = _prompt(tone="formal")

    assert "격식" in prompt


def test_answer_length_modes_differ() -> None:
    short = _prompt(length="short")
    medium = _prompt(length="medium")
    long_ = _prompt(length="long")

    assert short != medium != long_
    assert "2-3문장" in short or "간결" in short
    assert "상세" in long_ or "자세" in long_


def test_tone_and_length_are_independent_axes() -> None:
    # 간결한 어조 + 자세히를 함께 골라도 둘 다 지시에 남아야 조합이 된다.
    combined = _prompt(tone="plain", length="long")

    assert "짧" in combined or "간결" in combined
    assert "상세" in combined or "자세" in combined
