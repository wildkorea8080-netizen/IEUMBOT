"""문서 유형 판별 — 공통 경로가 망가뜨리는 문서만 걸러낸다.

배경: 서식·신청서는 빈 칸과 라벨만 있어 지식이 되지 않는다. 공통 경로에 넣으면
"성명 주소 연락처" 같은 항목이 FAQ 주제로 등록되고 관리자가 전부 지워야 한다.

오탐(멀쩡한 문서를 서식으로 판정)이 미탐보다 훨씬 나쁘다 — 관리자는 아무것도
못 받고 이유도 모른다. 그래서 판별은 보수적으로, 신호가 겹칠 때만 서식으로 본다.
"""

from app.services.admin.document_type import DocType, detect_document_type

APPLICATION_FORM = """별지 제3호 서식

폐기물 반입 신청서

성명 : ____________________
생년월일 : ____________________
주소 : ____________________
연락처 : (      ) -      -
사업자등록번호 : ____________________

폐기물 종류 : ____________________
예상 수량 : (        ) 톤
반입 희망일 :      년      월      일

위와 같이 신청합니다.

신청인 : ________________ (서명 또는 인)
"""

MANUAL = """제1장 총칙

1. 목적
이 매뉴얼은 폐기물 반입 업무의 처리 절차와 기준을 정함으로써 업무의 효율성을
확보하는 것을 목적으로 한다. 담당자는 본 매뉴얼에 따라 업무를 수행하여야 한다.

2. 적용 범위
본사 및 사업소에서 수행하는 모든 폐기물 반입 업무에 적용한다.
다만 긴급 재해 폐기물의 경우에는 별도의 지침을 따를 수 있다.
"""

QA_COLLECTION = """Q1. 폐기물 반입 수수료는 얼마인가요?
A. 톤당 단가에 실중량을 곱하여 산정하며, 단가는 매년 고시합니다.

Q2. 반입 신청은 언제까지 해야 하나요?
A. 반입 예정일 7일 전까지 신청서를 제출하셔야 합니다.

Q3. 신청 후 결과는 언제 통보되나요?
A. 접수일로부터 3일 이내에 검토 결과를 통보합니다.
"""

# 서식 안내문 — '신청서'라는 낱말은 나오지만 실제로는 설명글이다.
GUIDE_MENTIONING_FORMS = """반입 신청 안내

반입을 희망하는 배출자는 반입신청서를 작성하여 제출하여야 합니다.
신청서에는 폐기물의 종류와 예상 수량, 운반 차량 정보를 기재합니다.
제출된 신청서는 접수일로부터 3일 이내에 검토되며 결과를 통보해 드립니다.
문의는 폐기물고객센터로 연락하시기 바랍니다.
"""


def test_blank_application_form_is_detected() -> None:
    verdict = detect_document_type(APPLICATION_FORM)

    assert verdict.doc_type is DocType.FORM
    assert verdict.reason


def test_manual_is_left_to_the_common_path() -> None:
    assert detect_document_type(MANUAL).doc_type is DocType.GENERAL


def test_qa_collection_is_detected() -> None:
    assert detect_document_type(QA_COLLECTION).doc_type is DocType.QA


def test_prose_mentioning_forms_is_not_a_form() -> None:
    # '신청서' 낱말만 보고 판정하면 멀쩡한 안내문이 통째로 버려진다.
    assert detect_document_type(GUIDE_MENTIONING_FORMS).doc_type is DocType.GENERAL


def test_empty_text_is_general() -> None:
    assert detect_document_type("").doc_type is DocType.GENERAL
    assert detect_document_type("   \n  ").doc_type is DocType.GENERAL


def test_qa_wins_over_form_when_both_look_plausible() -> None:
    # Q&A 사례집에 서식 예시가 딸려 있어도 Q&A로 다뤄야 원문이 보존된다.
    text = QA_COLLECTION + "\n\n[별지] 신청서\n성명 : ______\n주소 : ______\n"

    assert detect_document_type(text).doc_type is DocType.QA
