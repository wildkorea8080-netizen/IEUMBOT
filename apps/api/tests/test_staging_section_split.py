"""문서를 헤딩 계층대로 쪼개고 문장 중간을 자르지 않는지 검증.

배경: 기존 청킹은 헤딩을 감지해 놓고도 제목으로 쓰지 않고, 1200자를 넘으면
`block[start:start+1200]` 로 원시 오프셋을 잘랐다. 그래서 추천 주제는 LLM이
청크 내용을 보고 지은 이름이라 서로 중복됐고, 내용은 문장 중간에서 끊겼다.
"제N장 > 소제목" 계층도 버려져 분류·세부분야가 태그 순서에 의존했다.
"""

from app.services.admin.knowledge_staging_service import (
    _is_heading,
    _split_semantic_chunks,
)


def test_heading_becomes_the_section_title() -> None:
    text = (
        "제1장 총칙\n\n"
        "1. 목적\n"
        + "이 지침은 사업 운영에 필요한 사항을 정한다. " * 8
        + "\n\n2. 적용 범위\n"
        + "이 지침은 본사와 지사 모두에 적용한다. " * 8
    )

    sections = _split_semantic_chunks(text)

    titles = [s.heading for s in sections]
    assert "1. 목적" in titles
    assert "2. 적용 범위" in titles


def test_chapter_becomes_the_category() -> None:
    text = (
        "제2장 급여\n\n"
        "1. 지급 기준\n"
        + "급여는 매월 25일에 지급한다. " * 12
        + "\n\n제3장 휴가\n\n"
        "1. 연차휴가\n"
        + "연차휴가는 1년 근속 시 15일이 부여된다. " * 12
    )

    sections = _split_semantic_chunks(text)
    by_heading = {s.heading: s for s in sections}

    assert by_heading["1. 지급 기준"].category == "제2장 급여"
    assert by_heading["1. 연차휴가"].category == "제3장 휴가"
    # 장 → 항목 2단뿐이면 세부분야는 비운다. 채우면 제목과 같은 값이 중복된다.
    assert by_heading["1. 지급 기준"].field is None


def test_middle_level_becomes_the_field() -> None:
    text = (
        "제2장 반입 절차\n\n"
        "1. 반입 신청\n"
        + "반입 신청서는 7일 전까지 제출한다. " * 12
        + "\n\n□ 제출 서류\n"
        + "성상분석서와 사업자등록증 사본을 함께 낸다. " * 12
    )

    by_heading = {s.heading: s for s in _split_semantic_chunks(text)}

    assert by_heading["□ 제출 서류"].category == "제2장 반입 절차"
    assert by_heading["□ 제출 서류"].field == "1. 반입 신청"


def test_long_section_splits_on_sentence_boundaries() -> None:
    sentence = "폐기물 반입 시에는 사전에 반입 신청서를 제출하여야 한다. "
    text = "1. 반입 절차\n" + sentence * 120  # 1200자를 크게 넘김

    sections = _split_semantic_chunks(text)
    parts = [s for s in sections if s.heading == "1. 반입 절차"]

    assert len(parts) > 1, "긴 섹션이 나뉘어야 한다"
    for part in parts:
        body = part.text.replace(part.heading, "", 1).strip()
        # 원시 오프셋으로 자르면 조각 끝이 '반입 신' 같은 어절 중간이 된다.
        assert body.endswith("."), f"문장 중간에서 잘렸다: ...{body[-25:]!r}"


def test_split_parts_keep_the_same_heading_and_are_numbered() -> None:
    text = "1. 반입 절차\n" + "폐기물은 반드시 계량 후 반입한다. " * 120

    parts = [s for s in _split_semantic_chunks(text) if s.heading == "1. 반입 절차"]

    assert {p.part for p in parts} == set(range(1, len(parts) + 1))
    assert all(p.part_count == len(parts) for p in parts)


def test_sentence_is_not_mistaken_for_a_heading() -> None:
    # 기존 규칙은 한글 2~15자 어절이 3개 이하면 무조건 제목으로 봤다.
    assert not _is_heading("이용료는 무료입니다")
    assert not _is_heading("신청서를 제출한다")
    assert not _is_heading("담당자에게 문의하세요")
    assert _is_heading("제1장 총칙")
    assert _is_heading("1. 목적")
    assert _is_heading("□ 신청 방법")


def test_heading_without_body_only_sets_the_breadcrumb() -> None:
    text = "제1장 총칙\n\n1. 목적\n" + "이 규정의 목적을 정한다. " * 12

    sections = _split_semantic_chunks(text)

    # 본문 없는 장 제목이 그 자체로 청크가 되면 안 된다.
    assert all(s.heading != "제1장 총칙" for s in sections)
    assert any(s.category == "제1장 총칙" for s in sections)


def test_short_but_titled_section_is_not_dropped() -> None:
    text = (
        "1. 반입 절차\n"
        + "반입 신청서를 제출한 뒤 계량과 검사를 거친다. " * 6
        + "\n\n2. 반입 수수료\n무료입니다.\n\n"
        "3. 문의처\n"
        + "자세한 사항은 폐기물고객센터로 문의한다. " * 6
    )

    headings = [s.heading for s in _split_semantic_chunks(text)]

    # 답이 짧다고 항목 자체가 사라지면 관리자는 누락 사실조차 모른다.
    assert "2. 반입 수수료" in headings


def test_document_without_headings_falls_back_to_paragraphs() -> None:
    text = "\n\n".join("문단 내용입니다. " * 20 for _ in range(4))

    sections = _split_semantic_chunks(text)

    assert len(sections) >= 3
    assert all(s.heading is None for s in sections)
    assert all(s.category is None for s in sections)
