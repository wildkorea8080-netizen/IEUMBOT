from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Any

logger = logging.getLogger(__name__)

_langfuse_client: Any = None
_current_trace: ContextVar[Any] = ContextVar("langfuse_trace", default=None)


def _get_client() -> Any:
    global _langfuse_client
    if _langfuse_client is not None:
        return _langfuse_client
    try:
        from app.core.config import settings  # noqa: PLC0415

        if not settings.langfuse_public_key or not settings.langfuse_secret_key:
            return None
        from langfuse import Langfuse  # noqa: PLC0415

        _langfuse_client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
        logger.info("[LANGFUSE] 클라이언트 초기화 완료 host=%s", settings.langfuse_host)
    except Exception as exc:
        logger.warning("[LANGFUSE] 초기화 실패: %s", exc)
        _langfuse_client = None
    return _langfuse_client


def start_chat_trace(question: str, chatbot_id: str, session_token: str) -> None:
    try:
        client = _get_client()
        if client is None:
            return
        trace = client.trace(
            name="chat",
            input=question,
            session_id=session_token,
            metadata={"chatbot_id": chatbot_id},
        )
        _current_trace.set(trace)
    except Exception as exc:
        logger.debug("[LANGFUSE] start_chat_trace 실패: %s", exc)


def record_retrieval(candidates: list[Any], latency_ms: int) -> None:
    try:
        trace = _current_trace.get()
        if trace is None:
            return
        span = trace.span(
            name="retrieval",
            output={"candidate_count": len(candidates)},
            metadata={"latency_ms": latency_ms},
        )
        span.end()
    except Exception as exc:
        logger.debug("[LANGFUSE] record_retrieval 실패: %s", exc)


def record_generation(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    answer_preview: str,
    latency_ms: int,
) -> None:
    try:
        trace = _current_trace.get()
        if trace is None:
            return
        gen = trace.generation(
            name="llm-generation",
            model=model,
            usage={"input": prompt_tokens, "output": completion_tokens},
            output=answer_preview[:500] if answer_preview else "",
            metadata={"latency_ms": latency_ms},
        )
        gen.end()
    except Exception as exc:
        logger.debug("[LANGFUSE] record_generation 실패: %s", exc)


def end_chat_trace(outcome: str, answer_text: str | None) -> None:
    try:
        trace = _current_trace.get()
        if trace is None:
            return
        trace.update(
            output=answer_text[:500] if answer_text else "",
            metadata={"outcome": outcome},
        )
        _current_trace.set(None)
    except Exception as exc:
        logger.debug("[LANGFUSE] end_chat_trace 실패: %s", exc)


def flush() -> None:
    try:
        client = _langfuse_client
        if client is not None:
            client.flush()
            logger.info("[LANGFUSE] flush 완료")
    except Exception as exc:
        logger.warning("[LANGFUSE] flush 실패: %s", exc)
