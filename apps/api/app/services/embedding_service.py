import json
import logging
import math
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.services.llm_api_config_runtime_service import resolve_runtime_api_config

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
logger = logging.getLogger(__name__)


@dataclass
class EmbeddingFailure(Exception):
    error_code: str
    error_message: str
    detail: str | None = None

    def __str__(self) -> str:
        return f"{self.error_code}: {self.error_message}"


def _embedding_url(provider: str, base_url: str | None) -> str:
    if provider == "azure_openai":
        if not base_url:
            return "https://example.invalid/openai/deployments/embedding/embeddings?api-version=2024-02-01"
        parsed = urllib.parse.urlparse(base_url)
        if parsed.query:
            return base_url
        return f"{base_url.rstrip('/')}/embeddings?api-version=2024-02-01"
    if base_url:
        return f"{base_url.rstrip('/')}/embeddings"
    return OPENAI_EMBEDDINGS_URL


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


def _normalize_embedding(values: list[Any]) -> list[float] | None:
    embedding = coerce_embedding_vector(values)
    if embedding is None:
        return None
    if len(embedding) != EMBEDDING_DIMENSIONS:
        return None
    norm = math.sqrt(sum(value * value for value in embedding))
    if norm <= 0:
        return None
    return embedding


def generate_embedding_or_raise(db: Session, text: str) -> list[float]:
    normalized = " ".join(text.strip().split())
    if not normalized:
        raise EmbeddingFailure("EMPTY_EMBEDDING_INPUT", "임베딩할 텍스트가 비어 있습니다.")

    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None or runtime_api.provider == "anthropic":
        raise EmbeddingFailure(
            "OPENAI_API_KEY_MISSING",
            "OpenAI 임베딩 API 설정이 없습니다.",
            "No active OpenAI/Azure OpenAI API config or API_OPENAI_API_KEY is configured.",
        )
    if not runtime_api.api_key.strip():
        raise EmbeddingFailure("OPENAI_API_KEY_MISSING", "OpenAI 임베딩 API 키가 비어 있습니다.")

    model = runtime_api.embedding_model or DEFAULT_EMBEDDING_MODEL
    payload: dict[str, Any] = {
        "model": model,
        "input": normalized[:12000],
    }
    if model == DEFAULT_EMBEDDING_MODEL:
        payload["dimensions"] = EMBEDDING_DIMENSIONS

    headers = {"Content-Type": "application/json"}
    if runtime_api.provider == "azure_openai":
        headers["api-key"] = runtime_api.api_key
    else:
        headers["Authorization"] = f"Bearer {runtime_api.api_key}"

    request = urllib.request.Request(
        url=_embedding_url(runtime_api.provider, runtime_api.base_url),
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            body = response.read().decode("utf-8")
        response_json = json.loads(body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise EmbeddingFailure(
            "EMBEDDING_API_ERROR",
            f"임베딩 API 호출 실패: HTTP {exc.code}",
            detail,
        ) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise EmbeddingFailure("EMBEDDING_API_ERROR", "임베딩 API 연결에 실패했습니다.", str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise EmbeddingFailure("EMBEDDING_API_ERROR", "임베딩 API 응답을 해석하지 못했습니다.", str(exc)) from exc

    data = response_json.get("data")
    if not isinstance(data, list) or not data:
        raise EmbeddingFailure("EMBEDDING_API_ERROR", "임베딩 API 응답에 data가 없습니다.")
    first = data[0]
    if not isinstance(first, dict) or not isinstance(first.get("embedding"), list):
        raise EmbeddingFailure("EMBEDDING_API_ERROR", "임베딩 API 응답에 embedding이 없습니다.")
    embedding = coerce_embedding_vector(first["embedding"])
    if embedding is None:
        raise EmbeddingFailure("EMBEDDING_API_ERROR", "임베딩 벡터를 숫자 배열로 변환하지 못했습니다.")
    if len(embedding) != EMBEDDING_DIMENSIONS:
        raise EmbeddingFailure(
            "EMBEDDING_DIMENSION_MISMATCH",
            f"임베딩 차원이 DB vector 차원과 다릅니다. expected={EMBEDDING_DIMENSIONS} actual={len(embedding)}",
        )
    normalized_embedding = _normalize_embedding(embedding)
    if normalized_embedding is None:
        raise EmbeddingFailure("EMBEDDING_API_ERROR", "임베딩 벡터가 비어 있거나 유효하지 않습니다.")
    return normalized_embedding


def generate_embedding(db: Session, text: str) -> list[float] | None:
    try:
        return generate_embedding_or_raise(db, text)
    except EmbeddingFailure as exc:
        logger.warning("[EMBEDDING_ERROR] error_code=%s error=%s", exc.error_code, exc.detail or exc.error_message)
        return None
