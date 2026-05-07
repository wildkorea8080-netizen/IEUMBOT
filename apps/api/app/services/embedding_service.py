import json
import math
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from sqlalchemy.orm import Session

from app.services.llm_api_config_runtime_service import resolve_runtime_api_config

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


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


def generate_embedding(db: Session, text: str) -> list[float] | None:
    normalized = " ".join(text.strip().split())
    if not normalized:
        return None

    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None or runtime_api.provider == "anthropic":
        return None

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
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None

    data = response_json.get("data")
    if not isinstance(data, list) or not data:
        return None
    first = data[0]
    if not isinstance(first, dict) or not isinstance(first.get("embedding"), list):
        return None
    return _normalize_embedding(first["embedding"])
