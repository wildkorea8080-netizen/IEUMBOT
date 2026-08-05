"""FAQ 검색에 분류를 반영 + 주어 없는 짧은 후속 질의 인식.

배경: FAQ 임베딩이 `question` 문장만으로 만들어져 대분류·소분류·태그가 검색에
전혀 반영되지 않았다. 서로 다른 대분류가 같은 태그를 공유하면(거주자주차/정기주차의
'이용요금') 엉뚱한 쪽이 매칭됐다. 게다가 '이용요금' 같은 주어 없는 질의는
후속 질문 패턴에 걸리지 않아 맥락 보정도 받지 못했다.
"""

from app.services.admin.faq_service import compose_faq_embedding_text
from app.services.chat.query_rewriter_service import _SHORT_QUERY_MAX_LEN, needs_rewriting

# 대화 이력이 2건 이상이어야 재작성 대상이 된다.
HISTORY = [
    {"role": "user", "content": "거주자주차 안내해줘"},
    {"role": "assistant", "content": "거주자주차는 …"},
]


def test_embedding_text_puts_category_before_question() -> None:
    text = compose_faq_embedding_text(
        question="이용요금이 얼마인가요?",
        category="거주자주차",
        field="요금",
        tags=["이용요금", "주차"],
    )
    assert text.startswith("거주자주차 요금 ")
    assert "이용요금이 얼마인가요?" in text
    assert "주차" in text


def test_same_tag_different_category_produces_different_text() -> None:
    """같은 태그를 공유해도 대분류가 다르면 임베딩 입력이 갈라져야 한다."""
    resident = compose_faq_embedding_text(
        question="이용요금이 얼마인가요?", category="거주자주차", tags=["이용요금"]
    )
    monthly = compose_faq_embedding_text(
        question="이용요금이 얼마인가요?", category="정기주차", tags=["이용요금"]
    )
    assert resident != monthly
    assert "거주자주차" in resident
    assert "정기주차" in monthly


def test_embedding_text_tolerates_missing_fields() -> None:
    assert compose_faq_embedding_text(question="이용요금") == "이용요금"
    assert compose_faq_embedding_text(question="이용요금", category="", tags=[]) == "이용요금"
    assert compose_faq_embedding_text(question="이용요금", tags=["", "  "]) == "이용요금"


def test_bare_noun_query_now_triggers_rewriting() -> None:
    """'이용요금'처럼 물음표도 지시어도 없는 짧은 질의가 후속 질문으로 인식돼야 한다."""
    for query in ("이용요금", "주차요금", "신청방법"):
        assert needs_rewriting(query, HISTORY) is True, query


def test_first_turn_is_never_rewritten() -> None:
    """이력이 없으면 새 주제이므로 맥락을 붙이지 않는다."""
    assert needs_rewriting("이용요금", []) is False
    assert needs_rewriting("이용요금", HISTORY[:1]) is False


def test_long_self_contained_query_is_not_rewritten_by_length_rule() -> None:
    """대상이 이미 들어간 긴 질의는 길이 규칙으로 끌려오지 않는다."""
    query = "거주자주차 이용요금은 어떻게 계산되나요"
    assert len(query) > _SHORT_QUERY_MAX_LEN
    assert needs_rewriting(query, HISTORY) is False


def test_existing_pronoun_patterns_still_match() -> None:
    for query in ("그거 더 자세히 알려줘", "아까 말한 내용이 뭐야"):
        assert needs_rewriting(query, HISTORY) is True, query
