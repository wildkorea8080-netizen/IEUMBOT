"""목차·차례 블록은 주제로 만들지 않는다.

배경: 48쪽 세무상담 사례집을 등록하니 첫 주제의 내용이 제1편 목차였다.
"중합소득세 과세예고통지 및 기한후 신고 / 근로장려금 신청 / ..." 처럼 항목만
나열돼 있어 답변이 되지 않는데, 제목은 LLM이 그럴듯한 질문으로 지어 준다.
관리자는 열어 보고 나서야 쓸모없다는 걸 안다.

목차는 업무 매뉴얼·지침서·사례집에 거의 항상 있으므로 공통 경로에서 거른다.
"""

from app.services.admin.knowledge_staging_service import (
    _looks_like_table_of_contents,
    _split_semantic_chunks,
)

TOC = """제1편.
플랫폼·프리랜서 노동자
중합소득세 과세예고통지 및 기한후 신고
근로장려금 신청
외화의 환급환산
기준경비를 추계신고 시 주요경비 산입 방법
수입금액에 플랫폼 중개수수료 포함 여부
미니건 종합소득세의 환급세액 청구
단순경비를 추계신고
간이과세자 세액계산서 발급기준
주택에 사업자등록 가능 여부
"""

TOC_WITH_PAGE_NUMBERS = """목  차

Ⅰ. 총칙 ·············································· 3
Ⅱ. 반입 절차 ······································· 12
Ⅲ. 수수료 산정 ···································· 25
Ⅳ. 검사 및 계량 ··································· 31
Ⅴ. 민원 처리 ······································· 44
Ⅵ. 부칙 ·············································· 51
"""

REAL_SECTION = """반입을 희망하는 배출자는 반입 예정일 7일 전까지 반입신청서를 제출하여야 한다.
신청서에는 폐기물의 종류, 예상 수량, 운반 차량 정보를 기재한다.
담당자는 접수일로부터 3일 이내에 검토 결과를 통보한다.
불일치가 확인된 경우 반입을 거부하고 그 사유를 문서로 통보한다.
"""

# 실제 본문 안의 짧은 나열 — 목차로 오인하면 안 된다.
SECTION_WITH_LIST = """제출 서류는 다음과 같다.
- 반입신청서 1부
- 폐기물 성상분석서 1부
- 사업자등록증 사본 1부
성상분석서는 발급일로부터 6개월 이내의 것이어야 한다.
접수 후 3일 이내에 결과를 통보한다.
"""


def test_bare_item_list_is_a_toc() -> None:
    assert _looks_like_table_of_contents(TOC)


def test_dot_leader_toc_is_detected() -> None:
    assert _looks_like_table_of_contents(TOC_WITH_PAGE_NUMBERS)


def test_prose_section_is_not_a_toc() -> None:
    assert not _looks_like_table_of_contents(REAL_SECTION)


def test_section_with_a_short_list_is_not_a_toc() -> None:
    # 나열이 있어도 앞뒤로 문장이 있으면 본문이다.
    assert not _looks_like_table_of_contents(SECTION_WITH_LIST)


def test_short_block_is_never_a_toc() -> None:
    assert not _looks_like_table_of_contents("반입 절차\n계량\n검사")


def test_toc_block_does_not_become_a_topic() -> None:
    text = (
        TOC
        + "\n\n1. 과세예고통지\n"
        + "과세예고통지를 받은 경우 30일 이내에 과세전적부심사를 청구할 수 있다. " * 6
    )

    sections = _split_semantic_chunks(text)

    assert [s.heading for s in sections] == ["1. 과세예고통지"]
    assert all("근로장려금 신청" not in s.text for s in sections)
