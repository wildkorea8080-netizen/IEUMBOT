"""외부 API 실시간 데이터가 프롬프트에서 질문 옆에 놓이는지 고정한다.

배경: KOTRA 해외시장뉴스 API가 정상 동작하는데도 답변에 반영되지 않았다.
로그상 트리거·호출·주입이 모두 성공했다(text_len=3023). 문제는 위치였다 —
실시간 데이터는 시스템 프롬프트 맨 끝에 있고, RAG 근거 [S1]~[S5]는 유저
프롬프트의 질문 바로 옆에 있었다. 모델은 질문에 붙어 있는 쪽으로 답했다.

이 파일의 주제 게이트 주석이 이미 같은 원리를 적어 두고 있다 —
"질문·근거 바로 옆(유저 프롬프트)이라 시스템 프롬프트의 같은 지시보다
강하게 작동한다". 실시간 데이터에도 그 원리를 적용한다.
"""

from app.schemas.answer_settings import AnswerSettings
from app.services.chat.prompt_assembly_service import build_answer_prompt

API_DATA = "말레이시아 해상 항법 솔루션 시장 동향 / 베트남 농기계 수요 확대"
MARKER = "[실시간 데이터]"


def _build(api_context: str | None):
    return build_answer_prompt(
        question="해외시장 뉴스",
        normalized_query="해외시장 뉴스",
        candidates=[],
        settings=AnswerSettings(),
        requires_cautious_wording=False,
        requires_warning_notice=False,
        api_context=api_context,
    )


def test_api_data_sits_in_the_user_prompt_next_to_the_question() -> None:
    prompt = _build(API_DATA)

    # 질문과 같은 메시지에 있어야 모델이 실제로 참고한다.
    assert MARKER in prompt["userPrompt"]
    assert API_DATA in prompt["userPrompt"]


def test_api_data_comes_after_the_question_itself() -> None:
    user_prompt = _build(API_DATA)["userPrompt"]

    assert user_prompt.index("해외시장 뉴스") < user_prompt.index(MARKER)


def test_evidence_instruction_mentions_the_realtime_data() -> None:
    user_prompt = _build(API_DATA)["userPrompt"]

    # "아래 근거만 사용" 지시만 남으면 모델이 실시간 데이터를 무시한다.
    assert "실시간 데이터" in user_prompt
    assert "아래 근거만 사용해" not in user_prompt


def test_nothing_added_when_there_is_no_api_data() -> None:
    prompt = _build(None)

    assert MARKER not in prompt["userPrompt"]
    assert MARKER not in prompt["systemPrompt"]
    # 평소에는 기존 문구가 그대로 유지된다.
    assert "아래 근거만 사용해" in prompt["userPrompt"]


def test_blank_api_data_is_treated_as_absent() -> None:
    prompt = _build("   \n  ")

    assert MARKER not in prompt["userPrompt"]
    assert MARKER not in prompt["systemPrompt"]
