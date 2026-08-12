"""위젯이 브라우저에서 차단한 개인정보 입력 시도를 서버에 통보하는 경로.

배경: 위젯은 개인정보를 로컬 정규식으로 막고 API를 아예 호출하지 않는다.
원문이 브라우저를 떠나지 않는 건 좋지만, 기관은 그런 시도가 있었다는 사실조차
알 수 없어 보안센터의 '개인정보 노출 위험'이 영원히 0이었다.

그래서 **원문은 보내지 않고 유형만** 통보한다. 공개 엔드포인트이므로
아무나 가짜 이벤트를 쌓지 못하도록 유형을 화이트리스트로 막고
세션당 건수를 제한한다.
"""

import pytest
from app.services.widget_security_report_service import (
    ALLOWED_PRIVACY_TYPES,
    MAX_EVENTS_PER_SESSION,
    WidgetReportRejected,
    normalize_detected_types,
    session_quota_key,
)


def test_known_types_pass_through() -> None:
    assert normalize_detected_types(["phone", "email"]) == ["phone", "email"]


def test_unknown_types_are_dropped() -> None:
    # 공개 엔드포인트라 임의 문자열이 그대로 DB에 들어가면 안 된다.
    assert normalize_detected_types(["phone", "<script>", "임의값"]) == ["phone"]


def test_duplicates_are_collapsed_and_order_kept() -> None:
    assert normalize_detected_types(["email", "phone", "email"]) == ["email", "phone"]


def test_empty_after_filtering_is_rejected() -> None:
    # 유형이 하나도 안 남으면 기록할 근거가 없다.
    with pytest.raises(WidgetReportRejected):
        normalize_detected_types(["아무거나", ""])


def test_type_list_is_capped() -> None:
    many = list(ALLOWED_PRIVACY_TYPES) * 3
    assert len(normalize_detected_types(many)) <= len(ALLOWED_PRIVACY_TYPES)


def test_quota_key_is_scoped_per_chatbot_and_session() -> None:
    a = session_quota_key("bot-1", "sess-1")
    b = session_quota_key("bot-1", "sess-2")
    c = session_quota_key("bot-2", "sess-1")

    assert a != b != c
    assert a != c


def test_quota_limit_is_a_sane_number() -> None:
    # 정상 이용자가 실수로 몇 번 입력하는 건 다 남아야 하고,
    # 스크립트로 수천 건 쌓는 건 막혀야 한다.
    assert 5 <= MAX_EVENTS_PER_SESSION <= 100
