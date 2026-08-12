"""위젯이 브라우저에서 차단한 개인정보 입력 시도를 보안 이벤트로 남긴다.

위젯은 개인정보를 로컬에서 막고 API를 호출하지 않는다. 원문이 브라우저를
떠나지 않는 건 지켜야 할 성질이지만, 그 결과 기관은 그런 시도가 있었다는
사실조차 알 수 없었다(보안센터의 '개인정보 노출 위험'이 항상 0).

그래서 **원문 대신 유형만** 받는다. 저장되는 질문 자리에는 원문이 아니라
차단됐다는 안내 문구가 들어간다.

이 경로는 인증 없는 공개 엔드포인트다. 아무나 가짜 이벤트를 쌓을 수 있으므로
유형을 화이트리스트로 막고 세션당 건수를 제한한다.
"""

import logging
import uuid

from app.core import cache

logger = logging.getLogger(__name__)

# privacy_guard_service가 붙이는 유형명과 맞춘다. 목록에 없는 값은 버린다.
ALLOWED_PRIVACY_TYPES = ("email", "rrn", "card", "phone", "account", "birthdate", "passport")

# 세션 하나가 만들 수 있는 최대 이벤트 수. 정상 이용자가 몇 번 실수하는 건
# 다 남기고, 스크립트로 수천 건 쌓는 건 막는 선.
MAX_EVENTS_PER_SESSION = 20
_QUOTA_TTL_SECONDS = 60 * 60

# 원문은 전송받지 않는다. 저장 자리에 무엇이 들어가는지 명시해 둔다.
BLOCKED_PLACEHOLDER = "(브라우저에서 차단 — 원문은 서버로 전송되지 않음)"


class WidgetReportRejected(Exception):
    """통보를 받아들일 수 없을 때. 호출부가 4xx로 바꾼다."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def normalize_detected_types(raw: list[str] | None) -> list[str]:
    """알려진 유형만 남기고 중복을 없앤다. 입력 순서는 유지한다."""
    seen: list[str] = []
    for value in raw or []:
        name = str(value).strip().lower()
        if name in ALLOWED_PRIVACY_TYPES and name not in seen:
            seen.append(name)
    if not seen:
        raise WidgetReportRejected("NO_KNOWN_TYPE", "알 수 없는 개인정보 유형입니다.")
    return seen


def session_quota_key(chatbot_id: str, session_token: str) -> str:
    return f"widget_sec_report:{chatbot_id}:{session_token}"


def consume_session_quota(chatbot_id: str, session_token: str) -> None:
    """세션당 상한을 넘으면 거절한다. 캐시가 없으면 통과시킨다(기록이 우선)."""
    key = session_quota_key(chatbot_id, session_token)
    try:
        used = int(cache.get(key) or 0)
    except Exception:  # noqa: BLE001
        return
    if used >= MAX_EVENTS_PER_SESSION:
        raise WidgetReportRejected("QUOTA_EXCEEDED", "요청이 너무 많습니다.")
    try:
        cache.set(key, used + 1, _QUOTA_TTL_SECONDS)
    except Exception:  # noqa: BLE001
        pass


def record_client_blocked_privacy_event(
    *,
    db,
    chatbot_id: str,
    organization_id: str,
    session_token: str,
    detected_types: list[str],
) -> None:
    """차단 사실을 security_events에 남긴다. 원문은 저장하지 않는다."""
    from app.models.security_event import SecurityEvent  # noqa: PLC0415

    db.add(
        SecurityEvent(
            organization_id=uuid.UUID(organization_id),
            chatbot_id=uuid.UUID(chatbot_id),
            session_id=(session_token or "")[:120] or None,
            event_type="privacy_exposure",
            severity="high",
            question_masked=BLOCKED_PLACEHOLDER,
            detected_patterns=detected_types,
            # 서버가 막은 건(blocked)과 구분한다.
            ai_response="client_blocked",
        )
    )
    db.commit()
    logger.info(
        "[SECURITY] client-blocked privacy report chatbot_id=%s types=%s",
        chatbot_id,
        detected_types,
    )
