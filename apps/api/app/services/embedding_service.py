"""임베딩 서비스.

OpenAI / Azure OpenAI 공식 SDK 기반. 클라이언트 싱글톤(LRU 캐시)으로 연결 풀링과
자동 재시도(429/일시적 장애)를 확보한다.

함수 시그니처는 sync 유지 — 기존 호출부 무수정. 추후 전면 async 전환 시
`OpenAI` → `AsyncOpenAI`로 갈아끼우면 됨.
"""

import hashlib
import logging
import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

import httpx
from openai import (
    APIConnectionError,
    APIError,
    APIStatusError,
    APITimeoutError,
    AzureOpenAI,
    OpenAI,
    RateLimitError,
)
from sqlalchemy.orm import Session

from app.core import cache as _cache
from app.services.llm_api_config_runtime_service import resolve_runtime_api_config

DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
DEFAULT_AZURE_API_VERSION = "2024-02-01"

# 임베딩 캐시 — Redis(있으면) 또는 in-memory. 키: sha256(model:text), TTL 7일.
# 텍스트 내용은 사용자 질문 등 일반적인 PII가 아닌 검색어 위주이므로 공유 캐시 허용.
_EMBED_CACHE_PREFIX = "embed:v1:"
_EMBED_CACHE_TTL = 7 * 24 * 60 * 60  # 7d


def _embed_cache_key(model: str, text: str) -> str:
    digest = hashlib.sha256(f"{model}\x00{text}".encode()).hexdigest()
    return f"{_EMBED_CACHE_PREFIX}{digest}"


def _cache_lookup(model: str, text: str) -> list[float] | None:
    cached = _cache.get(_embed_cache_key(model, text))
    if isinstance(cached, list) and len(cached) == EMBEDDING_DIMENSIONS:
        try:
            return [float(v) for v in cached]
        except (TypeError, ValueError):
            return None
    return None


def _cache_store(model: str, text: str, embedding: list[float]) -> None:
    if len(embedding) != EMBEDDING_DIMENSIONS:
        return
    _cache.set(_embed_cache_key(model, text), embedding, _EMBED_CACHE_TTL)

logger = logging.getLogger(__name__)

# 단건 임베딩은 read 12s, 배치는 30s까지 허용.
# 모든 클라이언트는 동일 timeout 사용하되, 호출자가 `with_options(timeout=...)`로 오버라이드 가능.
_DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=20.0, write=10.0, pool=5.0)
_DEFAULT_MAX_RETRIES = 2


@dataclass
class EmbeddingFailure(Exception):
    error_code: str
    error_message: str
    detail: str | None = None

    def __str__(self) -> str:
        return f"{self.error_code}: {self.error_message}"


def _parse_azure_endpoint(base_url: str | None) -> tuple[str, str]:
    """Azure OpenAI base_url에서 (azure_endpoint, api_version) 추출.

    예: https://x.openai.azure.com/openai/deployments/embedding/embeddings?api-version=2024-02-01
        → ('https://x.openai.azure.com', '2024-02-01')
    """
    if not base_url:
        return "https://example.invalid", DEFAULT_AZURE_API_VERSION
    parsed = urlparse(base_url)
    endpoint = f"{parsed.scheme}://{parsed.netloc}" if parsed.netloc else "https://example.invalid"
    api_version = DEFAULT_AZURE_API_VERSION
    if parsed.query:
        for pair in parsed.query.split("&"):
            if pair.startswith("api-version="):
                api_version = pair.split("=", 1)[1] or DEFAULT_AZURE_API_VERSION
                break
    return endpoint, api_version


@lru_cache(maxsize=16)
def _build_client(
    provider: str,
    api_key: str,
    base_url: str | None,
) -> OpenAI | AzureOpenAI:
    """프로바이더별 SDK 클라이언트 싱글톤. (provider, api_key, base_url) 단위 LRU 캐시."""
    if provider == "azure_openai":
        endpoint, api_version = _parse_azure_endpoint(base_url)
        return AzureOpenAI(
            api_key=api_key,
            azure_endpoint=endpoint,
            api_version=api_version,
            timeout=_DEFAULT_TIMEOUT,
            max_retries=_DEFAULT_MAX_RETRIES,
        )
    kwargs: dict[str, Any] = {
        "api_key": api_key,
        "timeout": _DEFAULT_TIMEOUT,
        "max_retries": _DEFAULT_MAX_RETRIES,
    }
    if base_url:
        kwargs["base_url"] = base_url.rstrip("/")
    return OpenAI(**kwargs)


def reset_embedding_clients() -> None:
    """런타임 설정 변경 시 캐시된 클라이언트 강제 폐기. 키 회전 등에 사용."""
    _build_client.cache_clear()


def coerce_embedding_vector(values: Any) -> list[float] | None:
    if values is None:
        return None
    if hasattr(values, "tolist"):
        values = values.tolist()
    elif isinstance(values, tuple):
        values = list(values)
    elif not isinstance(values, list):
        try:
            values = list(values)
        except TypeError:
            return None
    if len(values) == 0:
        return None
    try:
        return [float(value) for value in values]
    except (TypeError, ValueError):
        return None


def _normalize_embedding(values: Any) -> list[float] | None:
    embedding = coerce_embedding_vector(values)
    if embedding is None:
        return None
    if len(embedding) != EMBEDDING_DIMENSIONS:
        return None
    norm = math.sqrt(sum(value * value for value in embedding))
    if norm <= 0:
        return None
    return embedding


def _resolve_client(db: Session) -> tuple[OpenAI | AzureOpenAI, str, str, str]:
    """런타임 설정 → (client, provider, source, model). 실패 시 EmbeddingFailure raise."""
    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None or runtime_api.provider == "anthropic":
        raise EmbeddingFailure(
            "OPENAI_API_KEY_MISSING",
            "OpenAI 임베딩 API 설정이 없습니다.",
            "No active OpenAI/Azure OpenAI API config or API_OPENAI_API_KEY is configured.",
        )
    if not runtime_api.api_key.strip():
        raise EmbeddingFailure("OPENAI_API_KEY_MISSING", "OpenAI 임베딩 API 키가 비어 있습니다.")

    client = _build_client(runtime_api.provider, runtime_api.api_key, runtime_api.base_url)
    model = runtime_api.embedding_model or DEFAULT_EMBEDDING_MODEL
    return client, runtime_api.provider, runtime_api.source, model


def _wrap_openai_exception(exc: Exception) -> EmbeddingFailure:
    """openai SDK 예외 → EmbeddingFailure 매핑."""
    if isinstance(exc, RateLimitError):
        return EmbeddingFailure(
            "EMBEDDING_API_ERROR",
            "임베딩 API 호출 한도 초과 (rate limit).",
            str(exc)[:1000],
        )
    if isinstance(exc, APITimeoutError):
        return EmbeddingFailure(
            "EMBEDDING_API_ERROR",
            "임베딩 API 호출이 타임아웃되었습니다.",
            str(exc)[:1000],
        )
    if isinstance(exc, APIConnectionError):
        return EmbeddingFailure(
            "EMBEDDING_API_ERROR",
            "임베딩 API 연결에 실패했습니다.",
            str(exc)[:1000],
        )
    if isinstance(exc, APIStatusError):
        return EmbeddingFailure(
            "EMBEDDING_API_ERROR",
            f"임베딩 API 호출 실패: HTTP {exc.status_code}",
            str(exc)[:1000],
        )
    if isinstance(exc, APIError):
        return EmbeddingFailure(
            "EMBEDDING_API_ERROR",
            "임베딩 API 오류가 발생했습니다.",
            str(exc)[:1000],
        )
    return EmbeddingFailure(
        "EMBEDDING_API_ERROR",
        "임베딩 API 호출 중 알 수 없는 오류가 발생했습니다.",
        str(exc)[:1000],
    )


def _build_kwargs(model: str, input_value: Any) -> dict[str, Any]:
    kwargs: dict[str, Any] = {"model": model, "input": input_value}
    if model == DEFAULT_EMBEDDING_MODEL:
        kwargs["dimensions"] = EMBEDDING_DIMENSIONS
    return kwargs


def generate_embedding_or_raise(db: Session, text: str) -> list[float]:
    normalized = " ".join(text.strip().split())
    if not normalized:
        raise EmbeddingFailure("EMPTY_EMBEDDING_INPUT", "임베딩할 텍스트가 비어 있습니다.")

    client, provider, source, model = _resolve_client(db)
    truncated = normalized[:12000]

    # 캐시 조회 — 히트 시 API 호출 생략
    cached = _cache_lookup(model, truncated)
    if cached is not None:
        logger.info(
            "[EMBEDDING_CACHE_HIT] model=%s text_len=%s",
            model,
            len(truncated),
        )
        return cached

    logger.info(
        "[EMBEDDING] provider=%s source=%s model=%s text_len=%s",
        provider,
        source,
        model,
        len(truncated),
    )

    try:
        response = client.embeddings.create(**_build_kwargs(model, truncated))
    except (APIError, APIConnectionError, APITimeoutError) as exc:
        raise _wrap_openai_exception(exc) from exc

    data = getattr(response, "data", None)
    if not data:
        raise EmbeddingFailure("EMBEDDING_API_ERROR", "임베딩 API 응답에 data가 없습니다.")

    embedding = _normalize_embedding(data[0].embedding)
    if embedding is None:
        actual_len = len(getattr(data[0], "embedding", []) or [])
        raise EmbeddingFailure(
            "EMBEDDING_DIMENSION_MISMATCH",
            f"임베딩 차원이 DB vector 차원과 다릅니다. expected={EMBEDDING_DIMENSIONS} actual={actual_len}",
        )
    _cache_store(model, truncated, embedding)
    return embedding


def generate_embeddings_batch(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    texts: list[str],
    batch_size: int = 100,
) -> list[list[float] | None]:
    """텍스트 목록을 배치로 임베딩. 실패 항목은 None.

    OpenAI Embeddings API는 input에 문자열 배열 허용. batch_size 단위로 1회 호출.
    배치 전체 실패 시 1건씩 fallback 시도.
    """
    if not texts:
        return []

    try:
        effective_batch_size = max(1, min(int(batch_size), 2048))
    except (TypeError, ValueError):
        effective_batch_size = 100

    results: list[list[float] | None] = [None] * len(texts)

    try:
        client, provider, source, model = _resolve_client(db)
    except EmbeddingFailure as exc:
        logger.warning(
            "[EMBEDDING_BATCH_ERROR] organization_id=%s chatbot_id=%s error_code=%s",
            organization_id,
            chatbot_id,
            exc.error_code,
        )
        return results

    logger.info(
        "[EMBEDDING_BATCH] organization_id=%s chatbot_id=%s provider=%s source=%s model=%s text_count=%s batch_size=%s",
        organization_id,
        chatbot_id,
        provider,
        source,
        model,
        len(texts),
        effective_batch_size,
    )

    # 배치는 read timeout 더 길게.
    batch_client = client.with_options(
        timeout=httpx.Timeout(connect=5.0, read=40.0, write=20.0, pool=5.0),
    )

    for batch_start in range(0, len(texts), effective_batch_size):
        batch_texts = texts[batch_start : batch_start + effective_batch_size]
        normalized = [" ".join(str(text or "").strip().split())[:12000] for text in batch_texts]
        non_empty_indices = [i for i, t in enumerate(normalized) if t]

        # 캐시 조회 — 미스만 API 호출 대상으로 추림
        api_call_indices: list[int] = []  # batch_texts 내 인덱스
        api_call_texts: list[str] = []
        cache_hits = 0
        for local_idx in non_empty_indices:
            text = normalized[local_idx]
            cached = _cache_lookup(model, text)
            if cached is not None:
                results[batch_start + local_idx] = cached
                cache_hits += 1
            else:
                api_call_indices.append(local_idx)
                api_call_texts.append(text)

        if cache_hits:
            logger.info(
                "[EMBEDDING_BATCH_CACHE] batch_start=%s hits=%s misses=%s",
                batch_start, cache_hits, len(api_call_texts),
            )
        if not api_call_texts:
            continue

        try:
            response = batch_client.embeddings.create(**_build_kwargs(model, api_call_texts))
            data = getattr(response, "data", None) or []
            if len(data) != len(api_call_texts):
                raise EmbeddingFailure(
                    "EMBEDDING_API_ERROR",
                    "임베딩 API 배치 응답 개수가 요청 개수와 다릅니다.",
                )
            for i, item in enumerate(data):
                embedding = _normalize_embedding(item.embedding)
                if embedding is None:
                    raise EmbeddingFailure(
                        "EMBEDDING_DIMENSION_MISMATCH",
                        "임베딩 차원이 DB vector 차원과 다릅니다.",
                    )
                local_idx = api_call_indices[i]
                results[batch_start + local_idx] = embedding
                _cache_store(model, api_call_texts[i], embedding)
        except Exception as exc:  # noqa: BLE001 — fallback 시도 위한 broad catch
            logger.warning(
                "[EMBEDDING_BATCH_ERROR] organization_id=%s chatbot_id=%s batch_start=%s batch_size=%s error=%s",
                organization_id,
                chatbot_id,
                batch_start,
                len(api_call_texts),
                exc,
            )
            # 캐시 미스로 API 호출 시도했던 항목만 1건씩 재시도
            for local_idx in api_call_indices:
                global_idx = batch_start + local_idx
                try:
                    results[global_idx] = generate_embedding_or_raise(db, batch_texts[local_idx])
                except Exception as fb_exc:  # noqa: BLE001
                    logger.warning(
                        "[EMBEDDING_BATCH_FALLBACK_ERROR] organization_id=%s chatbot_id=%s index=%s error=%s",
                        organization_id,
                        chatbot_id,
                        global_idx,
                        fb_exc,
                    )
                    results[global_idx] = None

    return results


def generate_embedding(db: Session, text: str) -> list[float] | None:
    try:
        return generate_embedding_or_raise(db, text)
    except EmbeddingFailure as exc:
        logger.warning(
            "[EMBEDDING_ERROR] error_code=%s error=%s",
            exc.error_code,
            exc.detail or exc.error_message,
        )
        return None
