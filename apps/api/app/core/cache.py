"""경량 캐시 — Redis 우선, in-memory fallback.

두 가지 API:
- get/set/delete/delete_prefix: Redis(가용 시) → in-memory fallback. 다중 인스턴스 공유.
- get_local/set_local/delete_local: in-memory 전용. 민감한 값(API 키, 복호화된 시크릿 등)에 사용.

값은 JSON 직렬화 가능해야 한다(default=str 사용). 직렬화 불가 시 set은 silent skip.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

# in-memory store: key → (expires_at, raw_json)
_local_lock = threading.Lock()
_local: dict[str, tuple[float, Any]] = {}
_LOCAL_MAX_SIZE = 10_000

_shared_lock = threading.Lock()
_shared: dict[str, tuple[float, str]] = {}
_SHARED_MAX_SIZE = 10_000

# Redis 클라이언트(지연 초기화)
_redis_client: Any = None
_redis_init_done = False


# ── Redis 초기화 ─────────────────────────────────────────────────────────────


def _get_redis() -> Any:
    """Redis 클라이언트 얻기. 최초 호출 시 한 번만 시도, 실패하면 None 영구 캐시."""
    global _redis_client, _redis_init_done
    if _redis_init_done:
        return _redis_client
    _redis_init_done = True
    try:
        from app.core.config import settings  # noqa: PLC0415

        if not settings.api_redis_url:
            return None
        import redis  # noqa: PLC0415

        client = redis.Redis.from_url(
            settings.api_redis_url,
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2,
        )
        client.ping()
        _redis_client = client
        logger.info("[CACHE] Redis enabled url=%s", _safe_redis_dsn(settings.api_redis_url))
    except Exception as exc:
        logger.info("[CACHE] Redis unavailable, using in-memory fallback: %s", exc)
        _redis_client = None
    return _redis_client


def _safe_redis_dsn(dsn: str) -> str:
    if "@" in dsn:
        try:
            scheme, rest = dsn.split("://", 1)
            _, host = rest.split("@", 1)
            return f"{scheme}://***@{host}"
        except ValueError:
            pass
    return dsn


def reset_redis_client() -> None:
    """Redis 재연결 강제(테스트/키 회전)."""
    global _redis_client, _redis_init_done
    try:
        if _redis_client is not None:
            _redis_client.close()
    except Exception:
        pass
    _redis_client = None
    _redis_init_done = False


def close() -> None:
    """앱 종료(lifespan)에서 호출."""
    global _redis_client, _redis_init_done
    try:
        if _redis_client is not None:
            _redis_client.close()
    except Exception:
        pass
    _redis_client = None
    _redis_init_done = True


# ── 공유 캐시(Redis 또는 in-memory fallback) ─────────────────────────────────


def _evict_shared() -> None:
    if len(_shared) <= _SHARED_MAX_SIZE:
        return
    now = time.time()
    for k in list(_shared):
        if _shared[k][0] < now:
            _shared.pop(k, None)
    if len(_shared) > _SHARED_MAX_SIZE:
        oldest = sorted(_shared.items(), key=lambda kv: kv[1][0])
        for k, _ in oldest[: len(_shared) - _SHARED_MAX_SIZE]:
            _shared.pop(k, None)


def get(key: str) -> Any:
    """공유 캐시 조회. 미스/만료 시 None."""
    r = _get_redis()
    if r is not None:
        try:
            raw = r.get(key)
        except Exception as exc:
            logger.warning("[CACHE_GET_REDIS_FAILED] key=%s error=%s", key, exc)
            raw = None
        if raw is not None:
            try:
                return json.loads(raw)
            except (TypeError, ValueError):
                return None
    with _shared_lock:
        entry = _shared.get(key)
        if entry is None:
            return None
        expires_at, raw = entry
        if expires_at < time.time():
            _shared.pop(key, None)
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return None


def set(key: str, value: Any, ttl_seconds: int) -> None:
    """공유 캐시 저장. JSON 직렬화 불가하면 silent skip."""
    try:
        raw = json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError) as exc:
        logger.warning("[CACHE_SET_SKIP] key=%s reason=non_json error=%s", key, exc)
        return
    r = _get_redis()
    if r is not None:
        try:
            r.setex(key, ttl_seconds, raw)
            return
        except Exception as exc:
            logger.warning("[CACHE_SET_REDIS_FAILED] key=%s error=%s", key, exc)
    with _shared_lock:
        _shared[key] = (time.time() + ttl_seconds, raw)
        _evict_shared()


def delete(key: str) -> None:
    r = _get_redis()
    if r is not None:
        try:
            r.delete(key)
        except Exception as exc:
            logger.warning("[CACHE_DEL_REDIS_FAILED] key=%s error=%s", key, exc)
    with _shared_lock:
        _shared.pop(key, None)


def delete_prefix(prefix: str) -> int:
    """접두사 일치 키 일괄 삭제. 삭제된 개수 반환."""
    count = 0
    r = _get_redis()
    if r is not None:
        try:
            cursor = 0
            while True:
                cursor, keys = r.scan(cursor=cursor, match=f"{prefix}*", count=200)
                if keys:
                    r.delete(*keys)
                    count += len(keys)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.warning("[CACHE_DEL_PREFIX_REDIS_FAILED] prefix=%s error=%s", prefix, exc)
    with _shared_lock:
        for k in list(_shared):
            if k.startswith(prefix):
                _shared.pop(k, None)
                count += 1
    return count


# ── 로컬 캐시(in-memory only, 민감값용) ─────────────────────────────────────


def _evict_local() -> None:
    if len(_local) <= _LOCAL_MAX_SIZE:
        return
    now = time.time()
    for k in list(_local):
        if _local[k][0] < now:
            _local.pop(k, None)
    if len(_local) > _LOCAL_MAX_SIZE:
        oldest = sorted(_local.items(), key=lambda kv: kv[1][0])
        for k, _ in oldest[: len(_local) - _LOCAL_MAX_SIZE]:
            _local.pop(k, None)


def get_local(key: str) -> Any:
    with _local_lock:
        entry = _local.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at < time.time():
            _local.pop(key, None)
            return None
        return value


def set_local(key: str, value: Any, ttl_seconds: int) -> None:
    with _local_lock:
        _local[key] = (time.time() + ttl_seconds, value)
        _evict_local()


def delete_local(key: str) -> None:
    with _local_lock:
        _local.pop(key, None)


def delete_local_prefix(prefix: str) -> int:
    count = 0
    with _local_lock:
        for k in list(_local):
            if k.startswith(prefix):
                _local.pop(k, None)
                count += 1
    return count
