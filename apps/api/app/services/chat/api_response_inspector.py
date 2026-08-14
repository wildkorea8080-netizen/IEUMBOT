"""외부 API 응답에서 '목록'이 어디에 있고 어떤 필드가 있는지 찾아낸다.

게시판형(목록형) 설정을 하려면 itemsPath("response.body.itemList.item")와
필드 이름이 필요하다. 이걸 관리자가 직접 타이핑하게 하면 기관 담당자는
쓸 수 없다. 서버는 이미 원본 JSON을 갖고 있으므로 여기서 구조를 읽어
후보를 만들어 준다.

원본 JSON을 브라우저로 그대로 내려보내지 않는 이유는 응답이 수십 KB일 수 있고
(KOTRA는 한 페이지에 뉴스 수십 건), 관리자가 필요한 건 필드 이름과 예시값뿐이기
때문이다.
"""

import re
from dataclasses import dataclass, field
from typing import Any

# 카드 제목·링크로 쓸 만한 필드 이름. 공공 API는 영문 약어를 쓰므로 넓게 잡는다.
_TITLE_HINT = re.compile(r"titl|title|subject|name|nm$|nm[A-Z]", re.IGNORECASE)
_LINK_HINT = re.compile(r"url|link|href", re.IGNORECASE)

_MAX_FIELDS = 20
_SAMPLE_SCAN = 5  # 예시값을 찾을 때 훑어볼 항목 수
_SAMPLE_LEN = 80


@dataclass
class InspectedField:
    name: str
    sample: str


@dataclass
class ListShape:
    items_path: str
    item_count: int
    fields: list[InspectedField] = field(default_factory=list)
    suggested_title: str | None = None
    suggested_link: str | None = None


def _walk_object_arrays(data: Any, path: str = "") -> list[tuple[str, list[dict]]]:
    """dict를 담은 배열을 모두 찾아 (경로, 배열) 목록으로 반환한다."""
    found: list[tuple[str, list[dict]]] = []
    if isinstance(data, list):
        objects = [item for item in data if isinstance(item, dict)]
        if objects:
            found.append((path, objects))
        return found
    if isinstance(data, dict):
        for key, value in data.items():
            child = f"{path}.{key}" if path else key
            found.extend(_walk_object_arrays(value, child))
    return found


def _sample_for(objects: list[dict], name: str) -> str:
    """비어 있지 않은 첫 값을 예시로 쓴다. 전부 비어 있으면 빈 문자열."""
    for item in objects[:_SAMPLE_SCAN]:
        value = item.get(name)
        if value not in (None, "", [], {}):
            return str(value)[:_SAMPLE_LEN]
    return ""


def _suggest(fields: list[InspectedField], hint: re.Pattern[str]) -> str | None:
    """이름이 힌트에 걸리는 필드 중 **값이 실제로 있는** 것을 고른다.

    값을 함께 보는 이유: KOTRA의 cmdltNmKorn 은 이름만 보면 제목 같지만
    모든 항목이 빈 문자열이라 카드 제목으로 쓰면 목록이 통째로 빈칸이 된다.
    """
    for candidate in fields:
        if hint.search(candidate.name) and candidate.sample:
            return candidate.name
    return None


def inspect_list_shape(data: Any) -> ListShape | None:
    """응답에서 가장 그럴듯한 목록을 찾아 구조를 돌려준다. 없으면 None."""
    candidates = _walk_object_arrays(data)
    if not candidates:
        return None

    # 여러 배열이 있으면 항목이 가장 많은 쪽이 본문 목록일 가능성이 크다.
    # (meta/tags 같은 부수 배열보다 크다)
    items_path, objects = max(candidates, key=lambda pair: len(pair[1]))

    names: list[str] = []
    for item in objects[:_SAMPLE_SCAN]:
        for key in item:
            if key not in names:
                names.append(key)
    names = names[:_MAX_FIELDS]

    fields = [InspectedField(name=name, sample=_sample_for(objects, name)) for name in names]

    title = _suggest(fields, _TITLE_HINT)
    link = _suggest(fields, _LINK_HINT)
    if title is None:
        # 이름으로 못 찾으면 값이 가장 긴 필드를 제목으로 본다.
        with_value = [f for f in fields if f.sample]
        title = max(with_value, key=lambda f: len(f.sample)).name if with_value else None

    return ListShape(
        items_path=items_path,
        item_count=len(objects),
        fields=fields,
        suggested_title=title,
        suggested_link=link,
    )
