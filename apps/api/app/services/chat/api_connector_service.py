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

        # response_path 로 데이터 추출
        if endpoint.response_path:
            extracted = _extract_by_path(data, endpoint.response_path)
        else:
            extracted = data

        # response_template 으로 텍스트 생성
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
