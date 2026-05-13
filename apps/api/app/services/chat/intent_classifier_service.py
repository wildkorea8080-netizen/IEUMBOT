from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.repositories.super_admin.api_configs_repository import create_llm_usage_log
from app.schemas.answer_settings import AnswerSettings
from app.services.chat.answer_generation_service import (
    _anthropic_usage,
    _call_anthropic,
    _call_openai_like,
    _estimate_cost,
    _extract_output_text_anthropic,
    _extract_output_text_openai,
    _openai_usage,
)
from app.services.llm_api_config_runtime_service import resolve_runtime_api_config

IntentName = Literal[
    "greeting",
    "thanks",
    "goodbye",
    "compliment",
    "weather",
    "emotion",
    "smalltalk",
    "business_question",
    "out_of_scope",
]

CLASSIFIER_SYSTEM_PROMPT = (
    "You classify a Korean public-service chatbot user message. "
    "Return only compact JSON with keys intent, confidence, reason. "
    "Allowed intents: greeting, thanks, goodbye, compliment, weather, emotion, smalltalk, business_question, out_of_scope. "
    "business_question means the user asks about policies, applications, eligibility, documents, schedules, contacts, services, organizations, or projects. "
    "out_of_scope means unrelated requests such as food recommendations or general entertainment. "
    "Do not answer the user."
)

SMALLTALK_SYSTEM_PROMPT = (
    "You are a Korean public-service chatbot. Reply in one short, warm Korean sentence. "
    "Do not invent policy facts. Naturally invite the user to ask about institutional services or applications."
)


@dataclass(frozen=True)
class IntentClassification:
    intent: str | None
    confidence: float
    reason: str
    executed: bool
    error_code: str | None = None
    provider: str | None = None
    model: str | None = None
    usage: dict[str, Any] | None = None


@dataclass(frozen=True)
class NaturalIntentResponse:
    text: str | None
    executed: bool
    error_code: str | None = None
    provider: str | None = None
    model: str | None = None
    usage: dict[str, Any] | None = None


def _parse_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end >= start:
        stripped = stripped[start : end + 1]
    parsed = json.loads(stripped)
    return parsed if isinstance(parsed, dict) else {}


def _safe_confidence(value: Any) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(0.0, min(1.0, float(value)))
    try:
        return max(0.0, min(1.0, float(str(value))))
    except (TypeError, ValueError):
        return 0.0


def _call_runtime_llm(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    answer_settings: AnswerSettings,
    operation_type: str,
    system_prompt: str,
    user_prompt: str,
    max_output_tokens: int,
    temperature: float,
) -> dict[str, Any]:
    runtime_api = resolve_runtime_api_config(db)
    if runtime_api is None:
        return {
            "executed": False,
            "errorCode": "OPENAI_API_KEY_MISSING",
            "text": None,
            "provider": "openai",
            "model": answer_settings.model_runtime.model_name,
            "usage": {},
        }

    model_name = answer_settings.model_runtime.model_name or runtime_api.default_model or "gpt-4.1-mini"
    start = time.perf_counter()
    try:
        if runtime_api.provider == "anthropic":
            response_json = _call_anthropic(
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model_name,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                top_p=None,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
            text = _extract_output_text_anthropic(response_json)
            prompt_tokens, completion_tokens, total_tokens = _anthropic_usage(response_json)
        else:
            response_json = _call_openai_like(
                provider=runtime_api.provider,
                api_key=runtime_api.api_key,
                base_url=runtime_api.base_url,
                model=model_name,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                top_p=None,
                frequency_penalty=None,
                presence_penalty=None,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
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
            operation_type=operation_type,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            estimated_cost=estimated_cost,
            success=bool(text),
            error_code=None if text else "EMPTY_MODEL_OUTPUT",
            latency_ms=latency_ms,
        )
        return {
            "executed": True,
            "errorCode": None if text else "EMPTY_MODEL_OUTPUT",
            "text": text,
            "provider": runtime_api.provider,
            "model": model_name,
            "usage": {
                "promptTokens": prompt_tokens,
                "completionTokens": completion_tokens,
                "totalTokens": total_tokens,
                "estimatedCost": estimated_cost,
                "latencyMs": latency_ms,
            },
        }
    except Exception as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        error_code = f"{runtime_api.provider.upper()}_INTENT_CALL_FAILED"
        create_llm_usage_log(
            db,
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            api_config_id=runtime_api.api_config_id,
            provider=runtime_api.provider,
            model=model_name,
            operation_type=operation_type,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            estimated_cost=0,
            success=False,
            error_code=error_code,
            latency_ms=latency_ms,
        )
        return {
            "executed": True,
            "errorCode": error_code,
            "text": None,
            "provider": runtime_api.provider,
            "model": model_name,
            "usage": {"latencyMs": latency_ms, "exceptionType": type(exc).__name__},
        }


def classify_intent(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    question: str,
    answer_settings: AnswerSettings,
) -> IntentClassification:
    result = _call_runtime_llm(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        answer_settings=answer_settings,
        operation_type="intent_classification",
        system_prompt=CLASSIFIER_SYSTEM_PROMPT,
        user_prompt=f"Message: {question.strip()[:500]}",
        max_output_tokens=120,
        temperature=0.0,
    )
    text = str(result.get("text") or "")
    if not text:
        return IntentClassification(
            intent=None,
            confidence=0.0,
            reason=str(result.get("errorCode") or "empty classifier output"),
            executed=bool(result.get("executed")),
            error_code=result.get("errorCode") if isinstance(result.get("errorCode"), str) else None,
            provider=result.get("provider") if isinstance(result.get("provider"), str) else None,
            model=result.get("model") if isinstance(result.get("model"), str) else None,
            usage=dict(result.get("usage") or {}),
        )
    try:
        parsed = _parse_json_object(text)
    except Exception:
        parsed = {}
    intent = parsed.get("intent")
    if intent not in {
        "greeting",
        "thanks",
        "goodbye",
        "compliment",
        "weather",
        "emotion",
        "smalltalk",
        "business_question",
        "out_of_scope",
    }:
        intent = None
    return IntentClassification(
        intent=intent,
        confidence=_safe_confidence(parsed.get("confidence")),
        reason=str(parsed.get("reason") or "")[:300],
        executed=True,
        error_code=result.get("errorCode") if isinstance(result.get("errorCode"), str) else None,
        provider=result.get("provider") if isinstance(result.get("provider"), str) else None,
        model=result.get("model") if isinstance(result.get("model"), str) else None,
        usage=dict(result.get("usage") or {}),
    )


def generate_natural_intent_response(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
    question: str,
    intent: str,
    answer_settings: AnswerSettings,
) -> NaturalIntentResponse:
    result = _call_runtime_llm(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        answer_settings=answer_settings,
        operation_type="intent_smalltalk_response",
        system_prompt=SMALLTALK_SYSTEM_PROMPT,
        user_prompt=f"Intent: {intent}\nUser message: {question.strip()[:500]}",
        max_output_tokens=80,
        temperature=0.4,
    )
    text = str(result.get("text") or "").strip()
    return NaturalIntentResponse(
        text=text or None,
        executed=bool(result.get("executed")),
        error_code=result.get("errorCode") if isinstance(result.get("errorCode"), str) else None,
        provider=result.get("provider") if isinstance(result.get("provider"), str) else None,
        model=result.get("model") if isinstance(result.get("model"), str) else None,
        usage=dict(result.get("usage") or {}),
    )
