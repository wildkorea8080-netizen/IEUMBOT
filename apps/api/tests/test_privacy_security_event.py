"""개인정보 노출을 보안 이벤트로 남길 수 있는 지점이 어디인지 고정한다.

배경: 보안센터의 '개인정보 노출 위험'이 항상 0이었다. 파이프라인이 개인정보를
먼저 처리하고 나서 analyze_security를 부르는데,

  block 모드 → 차단 응답으로 early return. analyze_security까지 오지 않는다.
  mask  모드 → body.question이 마스킹된 문자열로 바뀐 뒤 넘어간다.

analyze_security의 1단계는 detect_and_mask_privacy를 다시 부르는 것이라
가려진 텍스트에서는 아무것도 못 찾는다. 그래서 이 유형은 구조상 기록이
불가능했다. 기록은 마스킹 '전'에 해야 한다.
"""

from app.services.chat.privacy_guard_service import detect_and_mask_privacy
from app.services.security_guard_service import analyze_security

RAW = "제 연락처는 010-1234-5678 이고 이메일은 hong@example.com 입니다."


def test_raw_question_is_detected_as_privacy_exposure() -> None:
    verdict = analyze_security(question=RAW, chatbot_id="c", session_id="s", db=None)

    assert verdict.has_event
    assert verdict.event_type == "privacy_exposure"
    assert verdict.should_block


def test_masked_question_no_longer_looks_like_privacy() -> None:
    masked = detect_and_mask_privacy(RAW)
    assert masked.detected

    verdict = analyze_security(
        question=masked.masked_text, chatbot_id="c", session_id="s", db=None
    )

    # 마스킹 후에는 개인정보로 잡히지 않는다 — 그래서 파이프라인이
    # 마스킹한 뒤에 기록하려 하면 영원히 0건이 된다.
    assert verdict.event_type != "privacy_exposure"


def test_masking_keeps_the_detected_types_for_logging() -> None:
    masked = detect_and_mask_privacy(RAW)

    # 기록에 쓸 근거(어떤 유형이 걸렸는지)는 마스킹 결과가 들고 있다.
    assert masked.types
    assert "phone" in masked.types or "email" in masked.types
