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

logger = logging.getLogger(__name__)

# ── 인메모리 캐시 ─────────────────────────────────────────────────────────────
# { endpoint_id: (cached_text, expires_at) }
_cache: dict[str, tuple[str, datetime]] = {}

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

def _cache_get(endpoint_id: str) -> str | None:
    entry = _cache.get(endpoint_id)
    if entry is None:
        return None
    text, expires_at = entry
    if datetime.now(UTC) >= expires_at:
        del _cache[endpoint_id]
        return None
    return text


def _cache_set(endpoint_id: str, text: str, seconds: int) -> None:
    _cache[endpoint_id] = (text, datetime.now(UTC) + timedelta(seconds=max(1, seconds)))


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


def call_api_endpoint(endpoint: ApiEndpoint, question: str) -> str | None:
    """
    단일 ApiEndpoint 호출.
    1. 캐시 확인
    2. urllib.request 로 API 호출 (timeout 5초)
    3. response_path 로 데이터 추출
    4. response_template 으로 텍스트 생성
    5. 캐시 저장
    실패 시 None 반환.
    """
    cached = _cache_get(str(endpoint.id))
    if cached is not None:
        logger.debug("[API_CONNECTOR] 캐시 히트 id=%s", endpoint.id)
        return cached

    try:
        url = endpoint.endpoint_url.strip()
        headers: dict[str, str] = dict(endpoint.headers or {})
        params: dict[str, str] = dict(endpoint.params or {})

        # 파라미터에 question 주입 지원
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

        if response_type == "view":
            cfg = dict(endpoint.view_config or {})
            text = _render_view(data, cfg)
        elif response_type == "list":
            cfg = dict(endpoint.list_config or {})
            text = _render_list(data, cfg)
        else:
            # text 타입: 기존 JSONPath + template 방식
            if endpoint.response_path:
                extracted = _extract_by_path(data, endpoint.response_path)
            else:
                extracted = data
            template = endpoint.response_template or "{data}"
            text = _render_template(template, extracted)

        if not text.strip():
            return None

        _cache_set(str(endpoint.id), text, endpoint.cache_seconds)
        logger.info("[API_CONNECTOR] 성공 name=%s text_len=%d", endpoint.name, len(text))
        return text

    except urllib.error.HTTPError as exc:
        logger.warning("[API_CONNECTOR] HTTP오류 name=%s status=%s", endpoint.name, exc.code)
        return None
    except TimeoutError:
        logger.warning("[API_CONNECTOR] 타임아웃 name=%s", endpoint.name)
        return None
    except Exception as exc:
        logger.warning("[API_CONNECTOR] 호출 실패 name=%s: %s", endpoint.name, exc)
        return None


def get_api_context(
    question: str,
    chatbot_id: str,
    db: Session,
) -> str | None:
    """
    매칭된 API 목록 순회 → 첫 번째 성공 결과 반환.
    RAG 컨텍스트와 병합할 텍스트 반환. 모두 실패 시 None.
    """
    endpoints = should_use_api(question, chatbot_id, db)
    if not endpoints:
        return None

    for ep in endpoints:
        result = call_api_endpoint(ep, question)
        if result:
            return result

    return None
