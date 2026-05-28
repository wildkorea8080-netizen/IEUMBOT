"""웹 페이지/리소스 fetch 공통 모듈.

httpx.Client 싱글톤으로 연결 풀링·자동 리다이렉트·인코딩 감지를 제공.
기존 urllib + ssl.create_default_context(verify=False) 동작과 동등 + 안정성 향상.

기관 웹사이트 중 인증서가 만료/자체서명인 경우가 많아 verify=False 유지.
프로덕션에서 verify=True로 강화하려면 환경변수로 토글 가능하게 확장.

함수 시그니처는 모두 sync — 호출부 무수정.
"""

from __future__ import annotations

import logging
import re
import ssl
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
DEFAULT_ACCEPT_HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_ACCEPT_LANGUAGE = "ko-KR,ko;q=0.9,en;q=0.8"
DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_MAX_BYTES = 2_000_000  # 2MB 안전 상한

# 일부 기관 사이트(자체서명/만료 인증서) 호환을 위해 SSL 검증 완화.
# 변경하려면 _build_client() 인자 조정.
_INSECURE_SSL_CONTEXT = ssl.create_default_context()
_INSECURE_SSL_CONTEXT.check_hostname = False
_INSECURE_SSL_CONTEXT.verify_mode = ssl.CERT_NONE


@dataclass
class FetchResult:
    content: bytes
    text: str
    final_url: str
    status_code: int
    content_type: str
    charset: str


_client: httpx.Client | None = None


def _build_client() -> httpx.Client:
    return httpx.Client(
        verify=_INSECURE_SSL_CONTEXT,
        follow_redirects=True,
        timeout=httpx.Timeout(
            connect=5.0,
            read=DEFAULT_TIMEOUT_SECONDS,
            write=10.0,
            pool=5.0,
        ),
        limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        headers={"User-Agent": DEFAULT_USER_AGENT, "Accept-Language": DEFAULT_ACCEPT_LANGUAGE},
    )


def get_client() -> httpx.Client:
    """싱글톤 httpx.Client. lifespan에서 close_client() 호출 권장."""
    global _client
    if _client is None or _client.is_closed:
        _client = _build_client()
    return _client


def close_client() -> None:
    """앱 종료 시 호출 (FastAPI lifespan)."""
    global _client
    if _client is not None and not _client.is_closed:
        try:
            _client.close()
        except Exception:
            pass
    _client = None


# ── 인코딩 감지 ───────────────────────────────────────────────────────────────

_CHARSET_META_RE = re.compile(rb'charset=["\']?\s*([A-Za-z0-9_\-]+)', re.IGNORECASE)


def _detect_charset(content_type: str, raw_bytes: bytes) -> str:
    """HTTP 헤더 → HTML meta 순서로 인코딩 감지. 실패 시 utf-8."""
    if content_type and "charset=" in content_type.lower():
        cs = content_type.lower().split("charset=")[-1].split(";")[0].strip()
        if cs:
            return cs
    head = raw_bytes[:4096]
    m = _CHARSET_META_RE.search(head)
    if m:
        try:
            return m.group(1).decode("ascii", errors="ignore") or "utf-8"
        except Exception:
            return "utf-8"
    return "utf-8"


# ── Public API ─────────────────────────────────────────────────────────────


def fetch(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
    max_bytes: int = DEFAULT_MAX_BYTES,
    accept: str = DEFAULT_ACCEPT_HTML,
) -> FetchResult:
    """단일 URL fetch. 실패 시 httpx.HTTPError(또는 하위 클래스) raise."""
    request_headers: dict[str, str] = {"Accept": accept}
    if headers:
        request_headers.update(headers)

    client = get_client()
    kwargs: dict[str, Any] = {"headers": request_headers}
    if timeout_seconds is not None:
        kwargs["timeout"] = httpx.Timeout(
            connect=5.0, read=timeout_seconds, write=10.0, pool=5.0
        )
    response = client.request(method, url, **kwargs)

    content = response.content[:max_bytes]
    content_type = response.headers.get("Content-Type", "")
    charset = _detect_charset(content_type, content)
    try:
        text = content.decode(charset, errors="replace")
    except (LookupError, ValueError):
        text = content.decode("utf-8", errors="replace")

    return FetchResult(
        content=content,
        text=text,
        final_url=str(response.url),
        status_code=response.status_code,
        content_type=content_type,
        charset=charset,
    )


def fetch_text(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
    max_bytes: int = DEFAULT_MAX_BYTES,
    accept: str = DEFAULT_ACCEPT_HTML,
) -> tuple[str, str, int]:
    """간편 헬퍼: (text, final_url, status_code) 반환."""
    result = fetch(
        url,
        headers=headers,
        timeout_seconds=timeout_seconds,
        max_bytes=max_bytes,
        accept=accept,
    )
    return result.text, result.final_url, result.status_code


def fetch_binary(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> tuple[bytes, str | None]:
    """간편 헬퍼: (content, content_type) 반환 — PDF/이미지 등 바이너리용."""
    result = fetch(
        url,
        headers=headers,
        timeout_seconds=timeout_seconds,
        max_bytes=max_bytes,
        accept="*/*",
    )
    return result.content, result.content_type or None
