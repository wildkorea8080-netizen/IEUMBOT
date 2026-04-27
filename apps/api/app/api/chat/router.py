from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.schemas.chat_policy import PreAnswerRequest, PreAnswerResponse
from app.schemas.chat_runtime import ChatRuntimeResponse
from app.services.chat.final_chat_pipeline_service import run_final_chat_pipeline
from app.services.chat.pre_answer_pipeline_service import run_pre_answer_policy_hook
from app.services.chat.sse_stream_service import generate_chat_sse_stream

router = APIRouter()


@router.post("/messages", response_model=ChatRuntimeResponse)
def chat_messages_entry(
    body: PreAnswerRequest,
    db: Session = Depends(get_db_session),
) -> ChatRuntimeResponse:
    return run_final_chat_pipeline(db, body=body)


@router.post("/messages/stream")
def chat_messages_stream_entry(
    body: PreAnswerRequest,
    db: Session = Depends(get_db_session),
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
    db: Session = Depends(get_db_session),
) -> PreAnswerResponse:
    return run_pre_answer_policy_hook(db, body=body)
