"""
외부 API 연동 서비스 (Sprint 3-D).

키워드 기반으로 질문과 매칭된 외부 API를 호출하고
RAG 답변에 병합할 실시간 텍스트 컨텍스트를 반환한다.

- 파이프라인이 sync이므로 urllib.request 로 동기 구현
- 인메모리 캐시 (cache_seconds 기준, Redis 없이)
- 실패해도 None 반환 — 메인 응답에 영향 없음
"""

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.api_endpoint import ApiEndpoint
from app.schemas.chat_runtime import ListItem, ListResponse, MoreLink, ViewResponse

logger = logging.getLogger(__name__)

# ── 인메모리 캐시 ─────────────────────────────────────────────────────────────
# { endpoint_id: (cached_text, cached_structured, expires_at) }
_cache: dict[str, tuple[str, ViewResponse | ListResponse | None, datetime]] = {}

_API_TIMEOUT = 5  # seconds


# ── JSONPath 단순 추출 ────────────────────────────────────────────────────────

def _extract_by_path(data: Any, path: str) -> Any:
    """
    단순 JSONPath 추출 (stdlib only).
    지원 형식: $.key / $.a.b.c / $.a[].b
    실패 시 None 반환.
    """
    try:
        # 표준 JSONPath 표기 제거: $ 또는 $. 시작 처리
        path = path.strip()
        if path.startswith("$."):
            path = path[2:]
        elif path.startswith("$"):
            path = path[1:]

        parts = [p for p in re.split(r"[\.\[\]]", path) if p]
        current: Any = data
        for part in parts:
            if isinstance(current, list):
                current = [item.get(part) for item in current if isinstance(item, dict) and part in item]
            elif isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current
    except Exception:
        return None


def _render_template(template: str, data: Any) -> str:
    """response_template에 데이터를 채워 텍스트 생성."""
    if data is None:
        return template
    if isinstance(data, list):
        items_str = "\n".join(str(item) for item in data[:10])
        return template.replace("{items}", items_str).replace("{data}", items_str)
    return template.replace("{data}", str(data)).replace("{items}", str(data))


def _build_view_response(data: Any, config: dict) -> ViewResponse | None:
    """API 응답 데이터 → ViewResponse (위젯 카드 렌더링용)."""
    title_raw = _extract_by_path(data, config["titlePath"]) if config.get("titlePath") else None
    content_raw = _extract_by_path(data, config["contentPath"]) if config.get("contentPath") else None
    link_raw = _extract_by_path(data, config["moreLinkPath"]) if config.get("moreLinkPath") else None

    if not title_raw and not content_raw:
        return None

    content_lines: list[str] = []
    if isinstance(content_raw, list):
        content_lines = [str(c) for c in content_raw if c]
    elif content_raw:
        content_lines = [str(content_raw)]

    more_link: MoreLink | None = None
    if link_raw:
        more_link = MoreLink(title="자세히 보기", url=str(link_raw))

    return ViewResponse(
        title=str(title_raw) if title_raw else "답변",
        content=content_lines,
        more_link=more_link,
    )


def _build_list_response(data: Any, config: dict) -> ListResponse | None:
    """API 응답 데이터 → ListResponse (위젯 목록 렌더링용)."""
    items_path = config.get("itemsPath") or ""
    items_raw = _extract_by_path(data, items_path) if items_path else data
    if not isinstance(items_raw, list):
        items_raw = [items_raw] if items_raw else []

    content_fields: list[str] = config.get("contentFields") or []
    column_labels: list[str] = config.get("columnLabels") or []
    link_field: str = config.get("sourceLinkPath") or ""
    target_font: str = config.get("targetLinkFont") or "_blank"

    items: list[ListItem] = []
    for raw_item in items_raw[:20]:
        if not isinstance(raw_item, dict):
            items.append(ListItem(title=str(raw_item)))
            continue

        title_val = str(raw_item.get(content_fields[0], "")) if content_fields else str(next(iter(raw_item.values()), ""))
        contents: list[str] = []
        for j, field in enumerate(content_fields[1:], 1):
            val = raw_item.get(field)
            if val is None:
                continue
            lbl = column_labels[j] if j < len(column_labels) else field
            contents.append(f"{lbl}: {val}")

        link = str(raw_item[link_field]) if link_field and raw_item.get(link_field) else None
        items.append(ListItem(
            title=title_val,
            contents=contents,
            target_link=link,
            target_link_label="자세히 보기" if link else None,
            target_link_font=target_font,
        ))

    return ListResponse(items=items) if items else None


def _render_view(data: Any, config: dict) -> str:
    """view 타입: 제목+내용+링크 카드 형식 텍스트 생성."""
    title = _extract_by_path(data, config.get("titlePath") or "") if config.get("titlePath") else None
    content = _extract_by_path(data, config.get("contentPath") or "") if config.get("contentPath") else None
    link = _extract_by_path(data, config.get("moreLinkPath") or "") if config.get("moreLinkPath") else None

    parts: list[str] = []
    if title:
        parts.append(f"[제목] {title}")
    if content:
        parts.append(str(content))
    if link:
        parts.append(f"자세히 보기: {link}")
    return "\n".join(parts) if parts else ""


def _render_list(data: Any, config: dict) -> str:
    """list 타입: 항목 목록 형식 텍스트 생성."""
    items_path = config.get("itemsPath") or ""
    items = _extract_by_path(data, items_path) if items_path else data
    if not isinstance(items, list):
        items = [items] if items else []

    content_fields: list[str] = config.get("contentFields") or []
    column_labels: list[str] = config.get("columnLabels") or []
    link_field: str = config.get("sourceLinkPath") or ""

    rows: list[str] = []
    for i, item in enumerate(items[:20], 1):
        if not isinstance(item, dict):
            rows.append(f"{i}. {item}")
            continue
        cell_parts: list[str] = []
        for j, field in enumerate(content_fields):
            val = item.get(field)
            if val is None:
                continue
            label = column_labels[j] if j < len(column_labels) else field
            cell_parts.append(f"{label}: {val}")
        link = item.get(link_field) if link_field else None
        row_text = " | ".join(cell_parts)
        if link:
            row_text += f" ({link})"
        rows.append(f"{i}. {row_text}")

    return "\n".join(rows)


# ── 캐시 ─────────────────────────────────────────────────────────────────────

def _cache_get(endpoint_id: str) -> tuple[str, ViewResponse | ListResponse | None] | None:
    entry = _cache.get(endpoint_id)
    if entry is None:
        return None
    text, structured, expires_at = entry
    if datetime.now(UTC) >= expires_at:
        del _cache[endpoint_id]
        return None
    return text, structured


def _cache_set(
    endpoint_id: str,
    text: str,
    structured: ViewResponse | ListResponse | None,
    seconds: int,
) -> None:
    _cache[endpoint_id] = (text, structured, datetime.now(UTC) + timedelta(seconds=max(1, seconds)))


# ── 핵심 함수 ─────────────────────────────────────────────────────────────────

def should_use_api(
    question: str,
    chatbot_id: str,
    db: Session,
) -> list[ApiEndpoint]:
    """
    질문에 intent_keywords 가 포함된 활성 ApiEndpoint 목록 반환.
    매칭: any(kw.lower() in question.lower() for kw in intent_keywords)
    """
    try:
        import uuid as _uuid  # noqa: PLC0415
        rows = db.execute(
            select(ApiEndpoint).where(
                and_(
                    ApiEndpoint.chatbot_id == _uuid.UUID(chatbot_id),
                    ApiEndpoint.is_enabled.is_(True),
                )
            )
        ).scalars().all()
    except Exception as exc:
        logger.warning("[API_CONNECTOR] DB 조회 실패: %s", exc)
        return []

    q_lower = question.lower()
    matched: list[ApiEndpoint] = []
    for row in rows:
        keywords = list(row.intent_keywords or [])
        if any(kw.lower() in q_lower for kw in keywords):
            matched.append(row)
    return matched


def call_api_endpoint(
    endpoint: ApiEndpoint, question: str
) -> tuple[str | None, ViewResponse | ListResponse | None]:
    """
    단일 ApiEndpoint 호출.
    반환: (llm_context_text, structured_response)
      - text: LLM 프롬프트에 주입할 텍스트 (None이면 API 미활용)
      - structured: view/list 타입일 때 위젯 렌더링용 구조화 응답 (text 타입이면 None)
    """
    cached = _cache_get(str(endpoint.id))
    if cached is not None:
        logger.debug("[API_CONNECTOR] 캐시 히트 id=%s", endpoint.id)
        return cached

    try:
        url = endpoint.endpoint_url.strip()
        headers: dict[str, str] = dict(endpoint.headers or {})
        params: dict[str, str] = dict(endpoint.params or {})

        for k, v in params.items():
            if isinstance(v, str) and "{question}" in v:
                params[k] = v.replace("{question}", question)

        method = (endpoint.method or "GET").upper()

        if method == "GET" and params:
            qs = urllib.parse.urlencode(params)
            url = f"{url}?{qs}" if "?" not in url else f"{url}&{qs}"
            req = urllib.request.Request(url, headers=headers, method="GET")
        elif method == "POST":
            body_data = json.dumps(params).encode("utf-8") if params else b"{}"
            headers.setdefault("Content-Type", "application/json")
            req = urllib.request.Request(url, data=body_data, headers=headers, method="POST")
        else:
            req = urllib.request.Request(url, headers=headers, method=method)

        with urllib.request.urlopen(req, timeout=_API_TIMEOUT) as resp:
            raw_body = resp.read().decode("utf-8", errors="replace")

        try:
            data = json.loads(raw_body)
        except json.JSONDecodeError:
            data = raw_body

        response_type = (endpoint.response_type or "text").lower()
        structured: ViewResponse | ListResponse | None = None

        if response_type == "view":
            cfg = dict(endpoint.view_config or {})
            text = _render_view(data, cfg)
            structured = _build_view_response(data, cfg)
        elif response_type == "list":
            cfg = dict(endpoint.list_config or {})
            text = _render_list(data, cfg)
            structured = _build_list_response(data, cfg)
        else:
            if endpoint.response_path:
                extracted = _extract_by_path(data, endpoint.response_path)
            else:
                extracted = data
            template = endpoint.response_template or "{data}"
            text = _render_template(template, extracted)

        if not text.strip():
            return None, None

        _cache_set(str(endpoint.id), text, structured, endpoint.cache_seconds)
        logger.info("[API_CONNECTOR] 성공 name=%s type=%s text_len=%d", endpoint.name, response_type, len(text))
        return text, structured

    except urllib.error.HTTPError as exc:
        logger.warning("[API_CONNECTOR] HTTP오류 name=%s status=%s", endpoint.name, exc.code)
        return None, None
    except TimeoutError:
        logger.warning("[API_CONNECTOR] 타임아웃 name=%s", endpoint.name)
        return None, None
    except Exception as exc:
        logger.warning("[API_CONNECTOR] 호출 실패 name=%s: %s", endpoint.name, exc)
        return None, None


def get_api_result(
    question: str,
    chatbot_id: str,
    db: Session,
) -> tuple[str | None, ViewResponse | ListResponse | None]:
    """
    매칭된 API 목록 순회 → 첫 번째 성공 결과 반환.
    (llm_context_text, structured_response) 튜플 반환.
    """
    endpoints = should_use_api(question, chatbot_id, db)
    if not endpoints:
        return None, None

    for ep in endpoints:
        text, structured = call_api_endpoint(ep, question)
        if text:
            return text, structured

    return None, None


def get_api_context(
    question: str,
    chatbot_id: str,
    db: Session,
) -> str | None:
    """하위 호환 래퍼 — 텍스트만 반환."""
    text, _ = get_api_result(question, chatbot_id, db)
    return text
