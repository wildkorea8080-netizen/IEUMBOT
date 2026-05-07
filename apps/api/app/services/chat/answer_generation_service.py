import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from sqlalchemy.orm import Session

from app.repositories.super_admin.api_configs_repository import create_llm_usage_log
from app.schemas.answer_settings import AnswerSettings
from app.services.enforcement_service import evaluate_api_error_spike_for_chatbot
from app.services.llm_api_config_runtime_service import resolve_runtime_api_config
from app.services.notification_service import maybe_notify_api_error

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"

MODEL_PRICING_PER_1M_TOKENS: dict[str, tuple[float, float]] = {
    "gpt-4.1-mini": (0.4, 1.6),
    "gpt-4.1": (2.0, 8.0),
    "gpt-4o-mini": (0.15, 0.6),
    "claude-3-5-sonnet": (3.0, 15.0),
}


def _price_for_model(model_name: str | None) -> tuple[float, float]:
    if not model_name:
        return (0.0, 0.0)
    lowered = model_name.lower()
    for key, pricing in MODEL_PRICING_PER_1M_TOKENS.items():
        if key in lowered:
            return pricing
    return (0.0, 0.0)


def _estimate_cost(model_name: str | None, *, prompt_tokens: int, completion_tokens: int) -> float:
    input_price, output_price = _price_for_model(model_name)
    estimated = (prompt_tokens / 1_000_000) * input_price + (completion_tokens / 1_000_000) * output_price
    return round(estimated, 6)


def _extract_output_text_openai(response_json: dict[str, Any]) -> str:
    output_text = response_json.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    chunks = []
    for item in response_json.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text":
                text = content.get("text")
                if isinstance(text, str):
                    chunks.append(text)
    return "\n".join(chunks).strip()


def _extract_output_text_anthropic(response_json: dict[str, Any]) -> str:
    chunks = []
    for content in response_json.get("content", []):
        if isinstance(content, dict) and content.get("type") == "text":
            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)
    return "\n".join(chunks).strip()


def _openai_usage(response_json: dict[str, Any]) -> tuple[int, int, int]:
    usage = response_json.get("usage")
    if not isinstance(usage, dict):
        return (0, 0, 0)
    prompt_tokens = int(usage.get("input_tokens") or 0)
    completion_tokens = int(usage.get("output_tokens") or 0)
    total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
    return (prompt_tokens, completion_tokens, total_tokens)


def _anthropic_usage(response_json: dict[str, Any]) -> tuple[int, int, int]:
    usage = response_json.get("usage")
    if not isinstance(usage, dict):
        return (0, 0, 0)
    prompt_tokens = int(usage.get("input_tokens") or 0)
    completion_tokens = int(usage.get("output_tokens") or 0)
    return (prompt_tokens, completion_tokens, prompt_tokens + completion_tokens)


def _post_json(
    *,
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
) -> dict[str, Any]:
    req = urllib.request.Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=18) as response:
        body = response.read().decode("utf-8")
    return json.loads(body)


def _build_openai_url(provider: str, base_url: str | None) -> str:
    if provider == "azure_openai":
        if base_url:
            parsed = urllib.parse.urlparse(base_url)
            if parsed.query:
                return base_url
            return f"{base_url.rstrip('/')}/openai/responses?api-version=2025-03-01-preview"
        return "https://example.invalid/openai/responses?api-version=2025-03-01-preview"
    if base_url:
        return f"{base_url.rstrip('/')}/responses"
    return OPENAI_RESPONSES_URL


def _call_openai_like(
    *,
    provider: str,
    api_key: str,
    base_url: str | None,
    model: str,
    temperature: float,
    max_output_tokens: int,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any]:
    payload = {
        "model": model,
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
            {"role": "user", "content": [{"type": "input_text", "text": user_prompt}]},
        ],
    }
    headers = {"Content-Type": "application/json"}
    if provider == "azure_openai":
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"
    return _post_json(url=_build_openai_url(provider, base_url), payload=payload, headers=headers)


def _call_anthropic(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    temperature: float,
    max_output_tokens: int,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any]:
    payload = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_output_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    url = f"{(base_url or 'https://api.anthropic.com').rstrip('/')}/v1/messages" if base_url else ANTHROPIC_MESSAGES_URL
    return _post_json(
        url=url,
        payload=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )


def generate_grounded_answer(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    prompt_bundle: dict[str, str],
    answer_settings: AnswerSettings,
) -> dict[str, Any]:
    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        create_llm_usage_log(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            api_config_id=None,
            provider="openai",
            model=answer_settings.model_runtime.model_name,
            operation_type="chat",
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            estimated_cost=0,
            success=False,
            error_code="OPENAI_API_KEY_MISSING",
            latency_ms=None,
        )
        return {
            "executed": False,
            "errorCode": "OPENAI_API_KEY_MISSING",
            "exceptionType": "ConfigurationError",
            "exceptionMessage": "No active LLM API config or API_OPENAI_API_KEY is configured.",
            "text": None,
            "raw": None,
            "usage": {},
            "provider": "openai",
            "model": answer_settings.model_runtime.model_name,
        }

    model_name = answer_settings.model_runtime.model_name or runtime_api.default_model or "gpt-4.1-mini"
    start = time.perf_counter()
    try:
        if runtime_api.provider == "anthropic":
            response_json = _call_anthropic(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model_name,
                temperature=float(answer_settings.model_runtime.temperature),
                max_output_tokens=int(answer_settings.model_runtime.max_tokens),
                system_prompt=prompt_bundle["systemPrompt"],
                user_prompt=prompt_bundle["userPrompt"],
            )
            text = _extract_output_text_anthropic(response_json)
            prompt_tokens, completion_tokens, total_tokens = _anthropic_usage(response_json)
        else:
            response_json = _call_openai_like(
                provider=runtime_api.provider,
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model_name,
                temperature=float(answer_settings.model_runtime.temperature),
                max_output_tokens=int(answer_settings.model_runtime.max_tokens),
                system_prompt=prompt_bundle["systemPrompt"],
                user_prompt=prompt_bundle["userPrompt"],
            )
            text = _extract_output_text_openai(response_json)
            prompt_tokens, completion_tokens, total_tokens = _openai_usage(response_json)

        latency_ms = int((time.perf_counter() - start) * 1000)
        estimated_cost = _estimate_cost(model_name, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens)
        create_llm_usage_log(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            api_config_id=runtime_api.api_config_id,
            provider=runtime_api.provider,
            model=model_name,
            operation_type="chat",
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            estimated_cost=estimated_cost,
            success=bool(text),
            error_code=None if text else "EMPTY_MODEL_OUTPUT",
            latency_ms=latency_ms,
        )
        maybe_notify_api_error(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            provider=runtime_api.provider,
            error_code="EMPTY_MODEL_OUTPUT",
        )
        if not text:
            evaluate_api_error_spike_for_chatbot(db, organization_id=organization_id, chatbot_id=chatbot_id)

        if not text:
            return {
                "executed": True,
                "errorCode": "EMPTY_MODEL_OUTPUT",
                "text": None,
                "raw": response_json,
                "usage": {
                    "promptTokens": prompt_tokens,
                    "completionTokens": completion_tokens,
                    "totalTokens": total_tokens,
                    "estimatedCost": estimated_cost,
                    "latencyMs": latency_ms,
                },
                "provider": runtime_api.provider,
                "model": model_name,
            }
        return {
            "executed": True,
            "errorCode": None,
            "text": text,
            "raw": response_json,
            "usage": {
                "promptTokens": prompt_tokens,
                "completionTokens": completion_tokens,
                "totalTokens": total_tokens,
                "estimatedCost": estimated_cost,
                "latencyMs": latency_ms,
            },
            "provider": runtime_api.provider,
            "model": model_name,
        }
    except urllib.error.HTTPError as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        error_code = f"{runtime_api.provider.upper()}_HTTP_{exc.code}"
        exception_message = str(exc.reason or exc)
        create_llm_usage_log(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            api_config_id=runtime_api.api_config_id,
            provider=runtime_api.provider,
            model=model_name,
            operation_type="chat",
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            estimated_cost=0,
            success=False,
            error_code=error_code,
            latency_ms=latency_ms,
        )
        maybe_notify_api_error(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            provider=runtime_api.provider,
            error_code=error_code,
        )
        evaluate_api_error_spike_for_chatbot(db, organization_id=organization_id, chatbot_id=chatbot_id)
        return {
            "executed": True,
            "errorCode": error_code,
            "exceptionType": type(exc).__name__,
            "exceptionMessage": exception_message,
            "text": None,
            "raw": None,
            "usage": {"latencyMs": latency_ms},
            "provider": runtime_api.provider,
            "model": model_name,
        }
    except Exception as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        error_code = f"{runtime_api.provider.upper()}_CALL_FAILED"
        create_llm_usage_log(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            api_config_id=runtime_api.api_config_id,
            provider=runtime_api.provider,
            model=model_name,
            operation_type="chat",
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            estimated_cost=0,
            success=False,
            error_code=error_code,
            latency_ms=latency_ms,
        )
        maybe_notify_api_error(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            provider=runtime_api.provider,
            error_code=error_code,
        )
        evaluate_api_error_spike_for_chatbot(db, organization_id=organization_id, chatbot_id=chatbot_id)
        return {
            "executed": True,
            "errorCode": error_code,
            "exceptionType": type(exc).__name__,
            "exceptionMessage": str(exc)[:500],
            "text": None,
            "raw": None,
            "usage": {"latencyMs": latency_ms},
            "provider": runtime_api.provider,
            "model": model_name,
        }
