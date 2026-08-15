"""목록형 항목의 부가 정보에 API 원본 키가 새지 않는다.

배경: 자동 채우기는 contentFields 만 채우고 columnLabels 는 비워 둔다.
서버가 라벨 없을 때 필드명으로 폴백하는 바람에 위젯 목록에
"newsWrtrNm: 박건원 · regn: 유럽" 처럼 KOTRA 내부 키가 그대로 찍혔다.
이 경로는 이용자 화면에 직접 렌더되는 문자열이라 키 노출은 허용되지 않는다.
"""

from app.services.chat.api_connector_service import _build_list_response

ITEMS = {
    "response": {
        "body": {
            "itemList": {
                "item": [
                    {
                        "newsTitl": "몽골-EAEU 임시 자유무역협정 발효",
                        "newsWrtrNm": "Undram Khatanbaatar",
                        "regn": "아시아",
                        "newsUrl": "https://dream.kotra.or.kr/user/globalBbs/1",
                    },
                    {
                        "newsTitl": "벨라루스, 건강한 식생활 관심 증가",
                        "newsWrtrNm": "박건원",
                        "regn": "유럽",
                        "newsUrl": "https://dream.kotra.or.kr/user/globalBbs/2",
                    },
                ]
            }
        }
    }
}

BASE_CONFIG = {
    "itemsPath": "response.body.itemList.item",
    "contentFields": ["newsTitl", "newsWrtrNm", "regn"],
    "sourceLinkPath": "newsUrl",
}


def test_라벨_없으면_값만_쓴다():
    result = _build_list_response(ITEMS, dict(BASE_CONFIG))

    assert result is not None
    first = result.items[0]
    assert first.title == "몽골-EAEU 임시 자유무역협정 발효"
    assert first.contents == ["Undram Khatanbaatar", "아시아"]


def test_원본_필드명이_이용자에게_노출되지_않는다():
    result = _build_list_response(ITEMS, dict(BASE_CONFIG))

    assert result is not None
    rendered = " ".join(c for item in result.items for c in item.contents)
    for raw_key in ("newsWrtrNm", "regn", "newsTitl", "newsUrl"):
        assert raw_key not in rendered


def test_관리자가_라벨을_넣으면_라벨을_쓴다():
    config = dict(BASE_CONFIG, columnLabels=["제목", "작성자", "지역"])

    result = _build_list_response(ITEMS, config)

    assert result is not None
    assert result.items[0].contents == ["작성자: Undram Khatanbaatar", "지역: 아시아"]


def test_라벨이_공백뿐이면_값만_쓴다():
    """폼에서 라벨 칸을 만들었다가 지우면 빈 문자열이 남는다. ": 값" 이 되면 안 된다."""
    config = dict(BASE_CONFIG, columnLabels=["제목", "  ", ""])

    result = _build_list_response(ITEMS, config)

    assert result is not None
    assert result.items[0].contents == ["Undram Khatanbaatar", "아시아"]


def test_라벨이_일부만_있으면_있는_것만_붙인다():
    config = dict(BASE_CONFIG, columnLabels=["제목", "작성자"])

    result = _build_list_response(ITEMS, config)

    assert result is not None
    assert result.items[0].contents == ["작성자: Undram Khatanbaatar", "아시아"]
