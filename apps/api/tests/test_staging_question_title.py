"""추천 주제를 섹션 제목이 아니라 '사용자가 실제로 할 법한 질문'으로 만든다.

배경: 헤딩을 제목으로 쓰기 시작하면서 중복은 사라졌지만, FAQ 질문 자리에
"1. 반입 절차" 처럼 번호가 붙은 섹션 제목이 그대로 들어갔다. 질문이 아니고,
번호는 임베딩에 노이즈라 FAQ 시맨틱 매칭 점수도 떨어뜨린다.
"""

from app.services.admin.knowledge_staging_service import (
    DocumentSection,
    _section_title,
    _strip_heading_marker,
)


def test_strips_numbering_and_symbols_from_headings() -> None:
    assert _strip_heading_marker("1. 반입 절차") == "반입 절차"
    assert _strip_heading_marker("2) 이용 요금") == "이용 요금"
    assert _strip_heading_marker("□ 제출 서류") == "제출 서류"
    assert _strip_heading_marker("③ 신청 방법") == "신청 방법"
    assert _strip_heading_marker("제2장 반입 절차") == "반입 절차"
    assert _strip_heading_marker("제15조 손해배상") == "손해배상"
    assert _strip_heading_marker("1-2. 계량 기준") == "계량 기준"


def test_plain_heading_is_left_alone() -> None:
    assert _strip_heading_marker("반입 절차") == "반입 절차"
    # 번호만 있고 내용어가 없으면 통째로 지우지 않는다.
    assert _strip_heading_marker("1.") == "1."


def test_llm_question_wins_over_the_heading() -> None:
    section = DocumentSection(text="본문", heading="1. 반입 절차")

    title = _section_title(section, "폐기물 반입 절차가 어떻게 되나요?", "규칙기반제목")

    assert title == "폐기물 반입 절차가 어떻게 되나요?"


def test_falls_back_to_heading_without_its_numbering() -> None:
    section = DocumentSection(text="본문", heading="1. 반입 절차")

    assert _section_title(section, "", "규칙기반제목") == "반입 절차"


def test_falls_back_to_rule_based_title_when_there_is_no_heading() -> None:
    section = DocumentSection(text="본문", heading=None)

    assert _section_title(section, "", "규칙기반제목") == "규칙기반제목"


def test_split_parts_are_numbered_only_on_the_heading_fallback() -> None:
    # LLM이 조각별 내용으로 질문을 만들면 서로 달라지므로 꼬리표가 필요 없다.
    section = DocumentSection(
        text="본문", heading="1. 반입 절차", part=2, part_count=3
    )
    assert _section_title(section, "계량은 어떻게 하나요?", "규칙") == "계량은 어떻게 하나요?"

    # 폴백은 조각마다 같은 제목이 되므로 구분자가 필요하다.
    assert _section_title(section, "", "규칙") == "반입 절차 (2/3)"
