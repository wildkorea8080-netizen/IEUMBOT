"""위젯 신뢰·보안 표기 뱃지 — 테마 저장 형식의 단일 출처.

위젯 공개 config(app/api/widget/router.py)와 관리자 위젯 설정
(app/services/admin/operations_service.py)이 같은 규칙을 써야
"관리자 화면에서 본 것"과 "이용자에게 보이는 것"이 어긋나지 않는다.

테마 저장 키:
    widgetTrustBadgesEnabled: bool   미설정이면 표시(기본 ON)
    widgetTrustBadges: [{icon, label}]  미설정이면 DEFAULT_TRUST_BADGES
"""

MAX_BADGES = 4
MAX_LABEL_LENGTH = 40
MAX_ICON_LENGTH = 4

DEFAULT_TRUST_BADGES: list[dict[str, str]] = [
    {"icon": "✓", "label": "공식 등록 자료 기반 답변"},
    {"icon": "🔒", "label": "개인정보 자동 보호"},
]


def read_enabled(theme: dict) -> bool:
    """뱃지 표시 여부. 미설정이면 True(기본 ON)."""
    enabled = theme.get("widgetTrustBadgesEnabled")
    if enabled is None:
        enabled = theme.get("widget_trust_badges_enabled")
    return enabled is not False


def normalize_badges(items: object) -> list[dict[str, str]]:
    """임의 입력 → 저장·표시에 안전한 뱃지 목록. 라벨 없는 항목은 버린다."""
    if not isinstance(items, list):
        return []
    badges: list[dict[str, str]] = []
    for item in items[:MAX_BADGES]:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        icon = str(item.get("icon") or "").strip()[:MAX_ICON_LENGTH] or "✓"
        badges.append({"icon": icon, "label": label[:MAX_LABEL_LENGTH]})
    return badges


def read_badges(theme: dict) -> list[dict[str, str]]:
    """테마에서 뱃지 목록 해석. 비활성이면 빈 목록, 미설정이면 기본 뱃지."""
    if not read_enabled(theme):
        return []
    raw = theme.get("widgetTrustBadges")
    if raw is None:
        raw = theme.get("widget_trust_badges")
    if raw is None:
        return list(DEFAULT_TRUST_BADGES)
    # 빈 배열은 "기본값으로 되돌리기"가 아니라 "아무것도 표시하지 않기"로 존중한다.
    return normalize_badges(raw)
