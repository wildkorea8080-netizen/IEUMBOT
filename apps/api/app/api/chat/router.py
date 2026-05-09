import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.repositories.chat.runtime_repository import update_message_feedback
from app.schemas.chat_policy import PreAnswerRequest, PreAnswerResponse
from app.schemas.chat_runtime import (
    ChatRuntimeResponse,
    MessageFeedbackRequest,
    MessageFeedbackResponse,
)
from app.services.chat.final_chat_pipeline_service import build_chat_pipeline_error_response, run_final_chat_pipeline
from app.services.chat.pre_answer_pipeline_service import run_pre_answer_policy_hook
from app.services.chat.sse_stream_service import generate_chat_sse_stream

router = APIRouter()
logger = logging.getLogger(__name__)
DB_SESSION_DEPENDENCY = Depends(get_db_session)

SAFE_CHAT_ERROR_MESSAGE = (
    "현재 자동 답변 처리에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주시거나, "
    "질문을 조금 더 구체적으로 남겨주시면 확인 가능한 범위에서 다시 안내해 드릴게요."
)


def _safe_error_response(body: PreAnswerRequest, exc: Exception) -> ChatRuntimeResponse:
    return build_chat_pipeline_error_response(
        body=body,
        exc=exc,
        include_debug_trace=False,
        stream_mode="error_fallback",
    )


@router.post("/messages", response_model=ChatRuntimeResponse)
def chat_messages_entry(
    body: PreAnswerRequest,
    db: Session = DB_SESSION_DEPENDENCY,
) -> ChatRuntimeResponse:
    try:
        return run_final_chat_pipeline(db, body=body)
    except Exception as exc:
        logger.exception("Chat message pipeline failed", extra={"chatbot_id": body.chatbot_id})
        db.rollback()
        return _safe_error_response(body, exc)


@router.post("/messages/stream")
def chat_messages_stream_entry(
    body: PreAnswerRequest,
    db: Session = DB_SESSION_DEPENDENCY,
) -> StreamingResponse:
    return StreamingResponse(
        generate_chat_sse_stream(db, body=body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/messages/precheck", response_model=PreAnswerResponse)
def chat_messages_precheck(
    body: PreAnswerRequest,
    db: Session = DB_SESSION_DEPENDENCY,
) -> PreAnswerResponse:
    return run_pre_answer_policy_hook(db, body=body)


@router.post("/messages/{message_id}/feedback", response_model=MessageFeedbackResponse)
def submit_message_feedback(
    message_id: str,
    body: MessageFeedbackRequest,
    db: Session = DB_SESSION_DEPENDENCY,
) -> MessageFeedbackResponse:
    """
    사용자가 assistant 메시지에 좋아요(1) / 싫어요(-1) 피드백 제출.
    동일 메시지에 재요청 시 덮어쓰기.
    """
    from app.models.chat_messages import ChatMessage

    msg = db.get(ChatMessage, message_id)
    if msg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if msg.role != "assistant":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Feedback only allowed on assistant messages",
        )

    updated = update_message_feedback(db, message_id=message_id, feedback=body.feedback)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    return MessageFeedbackResponse(
        message_id=str(updated.id),
        feedback=updated.user_feedback,
        feedback_at=updated.feedback_at.isoformat(),
    )
