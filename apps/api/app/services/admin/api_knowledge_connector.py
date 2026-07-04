"""공식 OpenAPI → 지식 수집 커넥터 코어 (공공특화 로드맵 ⑤).

국가법령정보센터 등 REST/OpenAPI가 반환하는 JSON을 항목 단위로 파싱해,
웹 크롤 결과와 동일한 `[URL]`-마킹 텍스트로 변환한다. 이 텍스트는 기존 웹소스
색인 경로(_split_website_chunks → 임베딩 → Document/DocumentChunk)를 그대로 재사용한다.

설정(config)은 WebSource.metadata_json["apiConfig"]에 저장(마이그레이션 불필요):
    {
      "method": "GET",
      "headers": {"Authorization": "..."},
      "params": {"OC": "key", "target": "law", "type": "JSON"},
      "itemsPath": "law",              # 응답에서 항목 배열까지의 dot 경로("" = 루트)
      "titleField": "법령명한글",       # 항목 내 제목 dot 경로
      "contentFields": ["조문내용"],    # 항목 내 본문 dot 경로(여러 개면 이어붙임)
      "urlField": "법령상세링크",        # (선택) 항목별 원문 링크
      "maxItems": 200
    }

WebSource.metadata_json["sourceKind"] == "api" 이면 이 커넥터가 크롤을 대체한다.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode, urlparse

from app.services import web_fetcher

logger = logging.getLogger(__name__)

_MAX_ITEMS_HARD = 500
_MAX_JSON_BYTES = 5_000_000  # 5MB


@dataclass
class ApiConnectorConfig:
    method: str = "GET"
    headers: dict[str, str] = field(default_factory=dict)
    params: dict[str, str] = field(default_factory=dict)
    items_path: str = ""
    title_field: str = ""
    content_fields: list[str] = field(default_factory=list)
    url_field: str = ""
    max_items: int = 200

    @classmethod
    def from_dict(cls, raw: dict[str, Any] | None) -> "ApiConnectorConfig":
        raw = raw or {}
        content_fields = raw.get("contentFields")
        if not content_fields:
            single = raw.get("contentField")
            content_fields = [single] if single else []
        try:
            max_items = int(raw.get("maxItems") or 200)
        except (TypeError, ValueError):
            max_items = 200
        return cls(
            method=str(raw.get("method") or "GET").upper(),
            headers={str(k): str(v) for k, v in (raw.get("headers") or {}).items()},
            params={str(k): str(v) for k, v in (raw.get("params") or {}).items()},
            items_path=str(raw.get("itemsPath") or ""),
            title_field=str(raw.get("titleField") or ""),
            content_fields=[str(c) for c in content_fields if c],
            url_field=str(raw.get("urlField") or ""),
            max_items=max(1, min(max_items, _MAX_ITEMS_HARD)),
        )


def is_api_source(web_source: Any) -> bool:
    meta = getattr(web_source, "metadata_json", None)
    return isinstance(meta, dict) and meta.get("sourceKind") == "api"


def _dig(obj: Any, path: str) -> Any:
    """dot 경로 탐색. 중간이 배열이면 첫 요소로 진입(단일 래퍼 대응)."""
    if not path:
        return obj
    cur = obj
    for part in path.split("."):
        if isinstance(cur, list):
            cur = cur[0] if cur else None
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _as_items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [it for it in value if isinstance(it, dict)]
    if isinstance(value, dict):
        return [value]
    return []


def _field_text(item: dict[str, Any], path: str) -> str:
    if not path:
        return ""
    value = _dig(item, path)
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except Exception:
            return str(value)
    return str(value).strip()


def _build_url(base_url: str, params: dict[str, str]) -> str:
    if not params:
        return base_url
    sep = "&" if ("?" in base_url) else "?"
    return f"{base_url}{sep}{urlencode(params)}"


@dataclass
class ParsedApiItem:
    title: str
    content: str
    url: str


def fetch_api_items(base_url: str, config: ApiConnectorConfig) -> list[ParsedApiItem]:
    """API 호출 → JSON 파싱 → 항목 리스트. 실패 시 httpx.HTTPError/ValueError raise."""
    url = _build_url(base_url, config.params)
    result = web_fetcher.fetch(
        url,
        method=config.method,
        headers=config.headers,
        accept="application/json, text/json;q=0.9, */*;q=0.5",
        max_bytes=_MAX_JSON_BYTES,
        timeout_seconds=20.0,
    )
    if result.status_code >= 400:
        raise ValueError(f"API 응답 오류: HTTP {result.status_code}")
    try:
        data = json.loads(result.text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON 파싱 실패: {exc}") from exc

    raw_items = _as_items(_dig(data, config.items_path))
    items: list[ParsedApiItem] = []
    for raw in raw_items[: config.max_items]:
        title = _field_text(raw, config.title_field) if config.title_field else ""
        content = "\n".join(
            _field_text(raw, cf) for cf in config.content_fields if _field_text(raw, cf)
        )
        item_url = _field_text(raw, config.url_field) if config.url_field else ""
        if not urlparse(item_url).scheme:
            item_url = ""
        if not (title or content):
            continue
        items.append(ParsedApiItem(title=title or "(제목 없음)", content=content, url=item_url))
    logger.info(
        "[API_CONNECTOR] fetched url=%s status=%s raw_items=%s parsed=%s",
        _redact(url), result.status_code, len(raw_items), len(items),
    )
    return items


def build_api_source_text(base_url: str, items: list[ParsedApiItem]) -> tuple[str, list[str]]:
    """항목들을 웹 크롤과 동일한 `[URL]`-마킹 텍스트로 변환. (text, item_urls) 반환."""
    blocks: list[str] = []
    urls: list[str] = []
    for it in items:
        marker_url = it.url or base_url
        urls.append(marker_url)
        blocks.append(
            "\n".join(
                [
                    f"[URL] {marker_url}",
                    f"[FINAL_URL] {marker_url}",
                    f"[TITLE] {it.title}",
                    "[EXTRACTION_METHOD] api",
                    "[NAVIGATION_REMOVED] false",
                    it.content,
                ]
            ).strip()
        )
    return "\n\n".join(blocks).strip(), urls


def preview_api_source(
    base_url: str, config: ApiConnectorConfig, limit: int = 5
) -> list[dict[str, str]]:
    """관리자 미리보기/테스트용: 앞 N개 항목의 제목·본문요약·URL."""
    items = fetch_api_items(base_url, config)
    preview: list[dict[str, str]] = []
    for it in items[:limit]:
        preview.append(
            {
                "title": it.title,
                "contentPreview": (it.content[:200] + "…") if len(it.content) > 200 else it.content,
                "url": it.url,
            }
        )
    return preview


def _redact(url: str) -> str:
    """로그용: 쿼리스트링(키 포함 가능)을 가림."""
    return url.split("?", 1)[0] + ("?…" if "?" in url else "")
