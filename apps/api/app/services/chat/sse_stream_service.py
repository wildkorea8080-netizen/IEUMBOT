import json
import logging
from collections.abc import Generator

from sqlalchemy.orm import Session

from app.schemas.chat_policy import PreAnswerRequest
from app.schemas.chat_runtime import ChatRuntimeResponse
from app.services.chat.final_chat_pipeline_service import run_final_chat_pipeline

logger = logging.getLogger(__name__)

SAFE_CHAT_ERROR_MESSAGE = (
    "현재 자동 답변 처리에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주시거나, "
    "질문을 조금 더 구체적으로 남겨주시면 확인 가능한 범위에서 다시 안내해 드릴게요."
)


def _to_sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _chunk_text(text: str, chunk_size: int = 28) -> list[str]:
    normalized = (text or "").strip()
    if not normalized:
        return []
    return [normalized[index : index + chunk_size] for index in range(0, len(normalized), chunk_size)]


def _build_done_payload(response: ChatRuntimeResponse) -> dict:
    messages = response.trace.get("messages", {}) if isinstance(response.trace, dict) else {}
    return {
        "requestId": response.request_id,
        "chatbotId": response.chatbot_id,
        "outcome": response.outcome,
        "sessionId": messages.get("sessionId"),
        "sessionToken": messages.get("sessionToken"),
        "assistantMessageId": messages.get("assistantMessageId"),
    }


def generate_chat_sse_stream(
    db: Session,
    *,
    body: PreAnswerRequest,
) -> Generator[str, None, None]:
    yield _to_sse_event(
        "start",
        {
            "chatbotId": body.chatbot_id,
            "streamingMode": "sse_non_stream_backend",
        },
    )
    try:
        response = run_final_chat_pipeline(db, body=body, stream_mode="sse")
    except Exception:
        logger.exception("Chat SSE pipeline failed", extra={"chatbot_id": body.chatbot_id})
        db.rollback()
        yield _to_sse_event(
            "fallback",
            {
                "outcome": "insufficient_evidence",
                "message": SAFE_CHAT_ERROR_MESSAGE,
                "warnings": ["CHAT_PIPELINE_RECOVERED_FROM_ERROR"],
            },
        )
        yield _to_sse_event("done", {"outcome": "insufficient_evidence", "sessionToken": body.session_token})
        return

    if response.outcome == "answered":
        text = response.answer.text if response.answer else ""
        chunks = _chunk_text(text)
        if chunks:
            for chunk in chunks:
                yield _to_sse_event("message_delta", {"delta": chunk})
        yield _to_sse_event(
            "message_complete",
            {
                "outcome": response.outcome,
                "warnings": response.answer.warnings if response.answer else [],
            },
        )
    else:
        event_name = "escalation" if response.outcome == "escalate" else "fallback"
        yield _to_sse_event(
            event_name,
            {
                "outcome": response.outcome,
                "message": response.answer.text if response.answer else "",
                "warnings": response.answer.warnings if response.answer else [],
            },
        )

    if response.citations:
        yield _to_sse_event("citations", {"items": [item.model_dump(by_alias=True) for item in response.citations]})

    yield _to_sse_event("done", _build_done_payload(response))
