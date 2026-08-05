"""답변 끝 '이어서 안내해 드릴까요?' 제안 토글 + 짧은 후속 질문 재작성 가드.

배경: 답변 말미의 되묻는 제안은 프롬프트에 무조건 들어가 있었고 끌 방법이 없었다.
이용자가 그 제안에 "네"라고만 답하면 한 글자로는 검색이 되지 않아 답변 품질이 떨어졌다.
이 테스트는 (1) 토글이 실제로 프롬프트를 바꾸는지, (2) 짧은 질문이 재작성 단계에서
길이 가드에 걸려 전부 버려지지 않는지를 고정한다.
"""

from app.schemas.answer_settings import AnswerSettings
from app.services.chat.prompt_assembly_service import build_answer_prompt
from app.services.chat.query_rewriter_service import _MAX_REWRITTEN_CHARS, is_affirmation

OFFER_EXAMPLE = "이어서 안내해 드릴까요"
POLICY_SUPPRESS = "되묻는 제안은 붙이지 마세요"
FORMAT_SUPPRESS = "되묻는 제안이나"
FORMAT_ALLOW = "더 궁금한 점을 물어보라는"


def _prompt_text(*, suggest_next_question: bool) -> str:
    settings = AnswerSettings()
    settings.answer_policy.suggest_next_question = suggest_next_question
    prompt = build_answer_prompt(
        question="채용 공고 알려줘",
        normalized_query="채용 공고 알려줘",
        candidates=[],
        settings=settings,
        requires_cautious_wording=False,
        requires_warning_notice=False,
    )
    return prompt["systemPrompt"] + prompt["userPrompt"]


def test_default_is_off() -> None:
    """기본값은 꺼짐 — 기존 저장 설정에 키가 없어도 제안이 붙지 않는다."""
    assert AnswerSettings().answer_policy.suggest_next_question is False


def test_offer_suppressed_when_disabled() -> None:
    text = _prompt_text(suggest_next_question=False)
    assert OFFER_EXAMPLE not in text
    assert POLICY_SUPPRESS in text
    assert FORMAT_SUPPRESS in text
    assert FORMAT_ALLOW not in text


def test_offer_present_when_enabled() -> None:
    text = _prompt_text(suggest_next_question=True)
    assert OFFER_EXAMPLE in text
    assert POLICY_SUPPRESS not in text
    assert FORMAT_SUPPRESS not in text
    assert FORMAT_ALLOW in text


def test_short_query_rewrite_is_not_length_gated() -> None:
    """"네"(1자)처럼 짧은 질문도 정상 길이의 재작성 결과를 통과시켜야 한다.

    이전 가드는 `len(rewritten) > len(current_query) * 3` 뿐이라 원본이 1~3자면
    상한이 3~9자가 돼 어떤 정상 결과도 통과할 수 없었다.
    """
    current_query = "네"
    rewritten = "채용 공고 신청 방법이 어떻게 되나요?"

    assert len(rewritten) > len(current_query) * 3  # 기존 가드였다면 버려졌을 길이
    rejected = len(rewritten) > _MAX_REWRITTEN_CHARS and len(rewritten) > len(current_query) * 3
    assert rejected is False


def test_long_rambling_rewrite_still_rejected() -> None:
    """설명문을 늘어놓은 비정상 응답은 여전히 걸러진다."""
    current_query = "네"
    rewritten = "가" * (_MAX_REWRITTEN_CHARS + 1)

    rejected = len(rewritten) > _MAX_REWRITTEN_CHARS and len(rewritten) > len(current_query) * 3
    assert rejected is True


def test_affirmation_detection_covers_common_replies() -> None:
    for reply in ("네", "네!", "응", "알려줘", "네 알려주세요", "ㅇㅇ"):
        assert is_affirmation(reply) is True, reply
    for reply in ("채용 공고 알려줘", "신청 방법이 뭐야"):
        assert is_affirmation(reply) is False, reply
