"""외부 API 응답에서 목록 위치와 필드를 자동으로 찾아낸다.

배경: 게시판형(목록형)을 설정하려면 관리자가 itemsPath("response.body.itemList.item")
같은 JSON 경로와 필드 이름을 직접 타이핑해야 했다. 기관 담당자에게는 무리한
요구다. 게다가 응답을 확인하는 테스트 버튼이 등록 팝업 뒤에 가려 있어 눌러 볼
수도 없었다.

서버는 이미 원본 JSON을 갖고 있으므로 여기서 구조를 분석해 내려보낸다.
"""

from app.services.chat.api_response_inspector import inspect_list_shape

KOTRA = {
    "response": {
        "header": {"resultCode": "00", "resultMsg": "NO ERROR"},
        "body": {
            "totalCnt": "95538",
            "pageNo": "1",
            "itemList": {
                "item": [
                    {
                        "cmdltNmKorn": "",
                        "newsTitl": "말레이시아 해상 항법 솔루션 시장 동향",
                        "newsWritDt": "2026-08-12",
                        "newsUrl": "https://dream.kotra.or.kr/user/globalBbs/1",
                        "kotraNm": "쿠알라룸푸르무역관",
                    },
                    {
                        "cmdltNmKorn": "",
                        "newsTitl": "베트남 농기계 수요 확대",
                        "newsWritDt": "2026-08-11",
                        "newsUrl": "https://dream.kotra.or.kr/user/globalBbs/2",
                        "kotraNm": "하노이무역관",
                    },
                ]
            },
        },
    }
}


def test_finds_the_item_array_path() -> None:
    shape = inspect_list_shape(KOTRA)

    assert shape is not None
    assert shape.items_path == "response.body.itemList.item"
    assert shape.item_count == 2


def test_collects_field_names_with_samples() -> None:
    shape = inspect_list_shape(KOTRA)
    names = [f.name for f in shape.fields]

    assert "newsTitl" in names
    assert "newsUrl" in names
    sample = next(f.sample for f in shape.fields if f.name == "newsTitl")
    assert "말레이시아" in sample


def test_suggests_title_and_link_fields() -> None:
    shape = inspect_list_shape(KOTRA)

    # 제목은 titl/title/name 류, 링크는 url/link 류를 먼저 본다.
    assert shape.suggested_title == "newsTitl"
    assert shape.suggested_link == "newsUrl"


def test_title_hint_beats_name_hint() -> None:
    """'titl' 이 'Nm' 보다 먼저다.

    KOTRA 응답에는 HS코드 설명(hsCdKorNm)이 newsTitl 보다 앞에 오고 값도 길다.
    이름 순서만 보고 고르면 카드 제목이 "디스크·테이프·솔리드 스테이트의
    비휘발성 기억장치…" 같은 품목 설명이 되고, 정작 뉴스 제목은 본문으로 밀린다.
    """
    data = {
        "items": [
            {
                "hsCdKorNm": "디스크·테이프·솔리드 스테이트의 비휘발성 기억장치와 스마트카드",
                "hsCdNm": "8523",
                "newsTitl": "러시아 북극항로 운영 시스템 및 기술 개발 현황",
                "newsUrl": "https://dream.kotra.or.kr/1",
            }
        ]
    }

    shape = inspect_list_shape(data)

    assert shape.suggested_title == "newsTitl"


def test_always_empty_fields_are_not_suggested_as_title() -> None:
    # cmdltNmKorn은 이름에 Nm이 들어가지만 값이 전부 비어 있다.
    shape = inspect_list_shape(KOTRA)

    assert shape.suggested_title != "cmdltNmKorn"


def test_picks_the_largest_array_when_several_exist() -> None:
    data = {
        "meta": {"tags": [{"id": 1}]},
        "result": {"rows": [{"id": i, "title": f"글 {i}"} for i in range(5)]},
    }

    shape = inspect_list_shape(data)

    assert shape.items_path == "result.rows"
    assert shape.item_count == 5


def test_top_level_array_is_supported() -> None:
    shape = inspect_list_shape([{"title": "가", "link": "https://a"}])

    assert shape is not None
    assert shape.items_path == ""
    assert shape.suggested_link == "link"


def test_returns_none_when_there_is_no_object_array() -> None:
    assert inspect_list_shape({"response": {"message": "ok", "count": 3}}) is None
    assert inspect_list_shape("문자열 응답") is None


def test_array_of_scalars_is_not_a_list_shape() -> None:
    # 값만 든 배열은 카드로 만들 필드가 없다.
    assert inspect_list_shape({"tags": ["a", "b", "c"]}) is None
