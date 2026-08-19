import html as _html
import re
from typing import Any

# 인용 제목에서 제거할 내비게이션/보일러플레이트(웹 크롤 잡음: 건너뛰기 메뉴·바로가기 등).
_NAV_CITATION_KEYWORDS = ("건너뛰기", "바로가기", "메뉴 닫기", "사이트맵", "전체메뉴")
_MENU_ONLY_TITLES = {
    "메뉴",
    "전체메뉴",
    "주메뉴",
    "목록",
    "이전",
    "다음",
    "처음",
    "끝",
    "닫기",
    "열기",
}
# 제목 앞에 붙은 장식 마커(■ ▶ ● ○ · ※ 등) — 정리해 깔끔한 제목으로.
_LEADING_MARKER_RE = re.compile(r"^[\s■▶◀●○◆◇▲△▽•·※*\-–—]+")

# 이중 인코딩(&amp;quot;)까지 푼다. HTMLParser 가 한 겹은 이미 풀어 주지만,
# 원본이 &amp;quot; 로 들어 있으면 &quot; 가 그대로 저장되어 위젯 인용 칩에
# 노출된다(실제 발생). 두 번이면 충분하고, 그 이상은 본문에 있던 &amp; 를
# 잘못 건드릴 수 있어 반복하지 않는다.
_MAX_UNESCAPE_PASSES = 2


def _decode_entities(value: str) -> str:
    """저장된 제목에 남은 HTML 엔티티를 사람이 읽는 글자로 되돌린다."""
    text = value
    for _ in range(_MAX_UNESCAPE_PASSES):
        decoded = _html.unescape(text)
        if decoded == text:
            break
        text = decoded
    return text


def _clean_display_name(value: Any) -> Any:
    """인용 칩에 그대로 찍히는 이름 — 엔티티를 풀고 공백을 정리한다."""
    if not isinstance(value, str):
        return value
    cleaned = " ".join(_decode_entities(value).split()).strip()
    return cleaned or None


def _clean_section_title(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = _LEADING_MARKER_RE.sub("", _decode_entities(value)).strip()
    return " ".join(cleaned.split()) or None


def _is_boilerplate_section(section: str | None) -> bool:
    """내비게이션/스킵링크/순수 메뉴 제목이면 True(인용에서 제외)."""
    if not section:
        return False
    lowered = section.lower()
    if any(keyword in lowered for keyword in _NAV_CITATION_KEYWORDS):
        return True
    return section in _MENU_ONLY_TITLES


def assemble_citations(
    *,
    candidates: list[dict[str, Any]],
    citation_display_mode: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    if citation_display_mode == "hidden":
        return []

    citation_limit = 2 if citation_display_mode == "compact" else min(top_k, 5)
    citations: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, ...]] = set()
    for item in candidates:
        source_type = item.get("sourceType")
        source_url = item.get("sourceUrl")
        document_version_id = item.get("documentVersionId")
        document_id = item.get("documentId")
        # 내비게이션/보일러플레이트 제목은 인용에서 제외하고, 장식 마커는 정리.
        section_title = _clean_section_title(item.get("sectionTitle"))
        if _is_boilerplate_section(section_title):
            continue
        key = (
            source_type,
            source_url or document_version_id or document_id or item.get("documentName"),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        citations.append(
            {
                "documentId": item.get("documentId"),
                "documentName": _clean_display_name(item.get("documentName")),
                "documentVersionId": item.get("documentVersionId"),
                "chunkId": item.get("chunkId"),
                "pageNumber": item.get("pageNumber"),
                "sectionTitle": section_title,
                "category": item.get("category"),
                "sourceType": item.get("sourceType"),
                "sourceUrl": item.get("sourceUrl"),
                "extractionMethod": item.get("extractionMethod"),
                "finalRank": item.get("finalRank"),
                "score": item.get("combinedScore"),
                "selectionReason": "retrieval_rank_selected",
            }
        )
        if len(citations) >= citation_limit:
            break
    return citations
