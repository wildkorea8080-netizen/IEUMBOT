import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.chat.policy_repository import get_chatbot_by_id
from app.repositories.chat.runtime_repository import (
    count_user_messages_in_session,
    create_chat_message,
    create_chat_session,
    create_citations,
    get_chat_session_by_token,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.chat_policy import PreAnswerRequest
from app.schemas.chat_runtime import ChatRuntimeResponse
from app.services.chat.answer_generation_service import generate_grounded_answer
from app.services.chat.citation_service import assemble_citations
from app.services.chat.fallback_response_service import build_fallback_response
from app.services.chat.policy_evaluation_service import evaluate_answer_policy
from app.services.chat.prompt_assembly_service import build_answer_prompt
from app.services.chat.retrieval_precheck_service import normalize_query, retrieve_for_precheck
from app.services.escalations.runtime_escalation_service import (
    get_effective_escalation_rules_for_runtime,
    map_escalation_target_for_runtime,
)
from app.services.guardrails.runtime_guardrails_service import get_effective_guardrails_for_runtime
from app.services.limits_service import check_conversation_limit
from app.services.enforcement_service import ensure_runtime_access_for_chatbot
from app.services.settings.answer_settings_service import get_effective_answer_settings_for_runtime

GREETING_RESPONSE = "안녕하세요! 무엇을 도와드릴까요?\n해외농업개발 관련 궁금하신 내용을 알려주세요."
SOFT_GUIDANCE_RESPONSES = [
    "안녕하세요! 무엇을 도와드릴까요?\n해외농업개발 관련 궁금하신 내용을 알려주세요.",
    "지금 바로 확인되는 자료는 많지 않지만, 알고 싶은 내용을 조금 더 구체적으로 말씀해 주시면 도와드릴게요.\n해외농업개발 관련 궁금하신 내용을 알려주세요.",
]


def _map_outcome_from_decision(decision: str) -> str:
    mapping = {
        "allow": "answered",
        "insufficient_evidence": "insufficient_evidence",
        "restricted": "restricted",
        "conflict": "conflict",
        "escalate": "escalate",
    }
    return mapping.get(decision, "insufficient_evidence")


def _build_public_runtime_trace(
    *,
    normalized_query: str,
    llm_executed: bool,
    llm_error_code: str | None,
    stream_mode: str,
    user_message_id: str,
    assistant_message_id: str,
    session_id: str,
    session_token: str,
) -> dict[str, Any]:
    return {
        "normalizedQuery": normalized_query,
        "llm": {
            "executed": llm_executed,
            "errorCode": llm_error_code,
            "streamMode": stream_mode,
        },
        "messages": {
            "userMessageId": user_message_id,
            "assistantMessageId": assistant_message_id,
            "sessionId": session_id,
            "sessionToken": session_token,
        },
    }


def _build_soft_guidance_response(*, user_turn_count: int) -> str:
    if user_turn_count <= 0:
        return SOFT_GUIDANCE_RESPONSES[0]
    return SOFT_GUIDANCE_RESPONSES[min(user_turn_count, len(SOFT_GUIDANCE_RESPONSES) - 1)]


def run_final_chat_pipeline(
    db: Session,
    *,
    body: PreAnswerRequest,
    stream_mode: str = "non_stream",
) -> ChatRuntimeResponse:
    chatbot = get_chatbot_by_id(db, body.chatbot_id)
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    _, chatbot = ensure_runtime_access_for_chatbot(db, chatbot_id=str(chatbot.id))
    check_conversation_limit(db, chatbot_id=str(chatbot.id))

    normalized_query = body.normalized_query or normalize_query(body.question)
    retrieval_output = retrieve_for_precheck(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        question=body.question,
        top_k=body.top_k,
        corpus_domain_policy=chatbot.corpus_domain_policy or {},
        search_control_policy=chatbot.search_control_policy or {},
    )

    answer_settings = get_effective_answer_settings_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )
    runtime_guardrails = get_effective_guardrails_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )

    policy_decision = evaluate_answer_policy(
        {
            "question": body.question,
            "normalizedQuery": normalized_query,
            "retrievedCandidates": retrieval_output["candidates"],
            "appliedRules": retrieval_output["trace"],
            "answerSettings": answer_settings,
            "answerValidationPolicy": chatbot.answer_validation_policy or {},
            "guardrailPolicy": chatbot.guardrail_policy or {},
            "runtimeGuardrails": runtime_guardrails,
        }
    )
    runtime_escalation_config = get_effective_escalation_rules_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )
    escalation_mapping = map_escalation_target_for_runtime(
        policy_decision=policy_decision,
        runtime_escalation_config=runtime_escalation_config,
    )
    policy_decision["escalation"] = escalation_mapping
    guardrail_eval = policy_decision.get("guardrailEvaluation") or {}
    decision = str(policy_decision.get("decision") or "insufficient_evidence")
    policy_flags = policy_decision.get("flags") or {}

    citations = assemble_citations(
        candidates=retrieval_output["candidates"],
        citation_display_mode=answer_settings.answer_format.citation_display_mode,
    )

    answer_text = ""
    warnings: list[str] = []
    llm_executed = False
    llm_error_code: str | None = None

    session_token = body.session_token or f"session_{uuid.uuid4().hex[:20]}"
    session = get_chat_session_by_token(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_token=session_token,
    )
    user_turn_count = count_user_messages_in_session(db, session_id=str(session.id)) if session is not None else 0

    if policy_flags.get("greetingDetected"):
        outcome = "answered"
        answer_text = GREETING_RESPONSE
    elif (
        decision in {"insufficient_evidence", "conflict", "escalate"}
        and not policy_flags.get("unrelatedQuestion")
        and user_turn_count < 2
    ):
        outcome = "answered"
        answer_text = _build_soft_guidance_response(user_turn_count=user_turn_count)
    elif decision != "allow":
        fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
        outcome = fallback["outcome"]
        answer_text = fallback["text"]
        warnings = fallback.get("warnings", [])
    else:
        prompt_bundle = build_answer_prompt(
            question=body.question,
            normalized_query=normalized_query,
            candidates=retrieval_output["candidates"],
            settings=answer_settings,
            requires_cautious_wording=bool(guardrail_eval.get("requiresCautiousWording")),
            requires_warning_notice=bool(guardrail_eval.get("requiresWarningNotice")),
        )
        generation = generate_grounded_answer(
            db,
            organization_id=str(chatbot.organization_id),
            chatbot_id=str(chatbot.id),
            prompt_bundle=prompt_bundle,
            answer_settings=answer_settings,
        )
        llm_executed = bool(generation.get("executed"))
        llm_error_code = generation.get("errorCode")

        if generation.get("text"):
            answer_text = str(generation["text"])
            if guardrail_eval.get("requiresWarningNotice"):
                warnings.append("최신 기준과 개별 조건에 따라 결과가 달라질 수 있으니 담당 부서 확인이 필요합니다.")
            outcome = "answered"
        else:
            fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
            if fallback["outcome"] == "answered":
                outcome = "escalate"
            else:
                outcome = fallback["outcome"]
            answer_text = fallback["text"]
            if llm_error_code:
                warnings.append("자동 응답 처리 중 오류로 안전 안내로 전환되었습니다.")

    if outcome == "answered" and answer_settings.answer_policy.require_citations and not citations:
        fallback = build_fallback_response(policy_decision=policy_decision, answer_settings=answer_settings)
        outcome = "insufficient_evidence"
        answer_text = fallback["text"]
        llm_executed = False
        warnings.append("인용 정보가 부족하여 답변을 안전 안내로 전환했습니다.")

    request_id = f"chat_run_{uuid.uuid4().hex[:16]}"
    if session is None:
        session = create_chat_session(
            db,
            organization_id=str(chatbot.organization_id),
            chatbot_id=str(chatbot.id),
            session_token=session_token,
            source_url=body.source_url,
        )
    elif body.source_url and not session.source_url:
        session.source_url = body.source_url

    user_message = create_chat_message(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_id=str(session.id),
        request_id=request_id,
        role="user",
        content=body.question,
        status="completed",
        model_name=None,
        result_type=None,
        normalized_query=normalized_query,
        retrieved_documents=[],
        selected_sources=[],
        final_decision={},
        validation_signals={},
    )
    assistant_message = create_chat_message(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        session_id=str(session.id),
        request_id=request_id,
        role="assistant",
        content=answer_text,
        status="completed",
        model_name=answer_settings.model_runtime.model_name if llm_executed else None,
        result_type=outcome,
        normalized_query=normalized_query,
        retrieved_documents=retrieval_output["candidates"],
        selected_sources=citations,
        final_decision=policy_decision,
        validation_signals=policy_decision.get("flags", {}),
        escalation_reason=(
            policy_decision.get("reason")
            if outcome in {"escalate", "restricted", "conflict", "insufficient_evidence"}
            else None
        ),
        escalation_target_department=(
            escalation_mapping.get("targetDepartment")
            if outcome in {"escalate", "restricted", "conflict", "insufficient_evidence"}
            else None
        ),
        escalation_target_queue=(
            escalation_mapping.get("targetQueue")
            if outcome in {"escalate", "restricted", "conflict", "insufficient_evidence"}
            else None
        ),
    )
    create_citations(
        db,
        organization_id=str(chatbot.organization_id),
        chat_message_id=str(assistant_message.id),
        citations=citations,
    )

    create_audit_log(
        db,
        organization_id=str(chatbot.organization_id),
        admin_id=None,
        action="chat.final_pipeline.executed",
        target_type="chatbot",
        target_id=str(chatbot.id),
        result="success",
        request_id=request_id,
        metadata_json={
            "outcome": outcome,
            "streamMode": stream_mode,
            "llmExecuted": llm_executed,
            "llmErrorCode": llm_error_code,
            "policyDecision": decision,
            "reason": policy_decision.get("reason"),
            "escalationMapping": escalation_mapping,
            "guardrailMatchedRuleIds": guardrail_eval.get("matchedRuleIds", []),
            "retrievalSummary": [
                {
                    "documentId": item.get("documentId"),
                    "documentVersionId": item.get("documentVersionId"),
                    "rank": item.get("finalRank"),
                    "score": item.get("combinedScore"),
                }
                for item in retrieval_output["candidates"][:5]
            ],
            "effectiveSettingsSummary": {
                "assistantRoleMode": answer_settings.prompt_instruction.assistant_role_mode,
                "toneMode": answer_settings.prompt_instruction.tone_mode,
                "answerStyleMode": answer_settings.prompt_instruction.answer_style_mode,
                "requireCitations": answer_settings.answer_policy.require_citations,
                "modelName": answer_settings.model_runtime.model_name,
                "temperature": answer_settings.model_runtime.temperature,
                "maxTokens": answer_settings.model_runtime.max_tokens,
            },
            "citationSummary": [
                {
                    "documentId": item.get("documentId"),
                    "documentVersionId": item.get("documentVersionId"),
                    "pageNumber": item.get("pageNumber"),
                    "sectionTitle": item.get("sectionTitle"),
                    "rank": item.get("finalRank"),
                }
                for item in citations
            ],
        },
    )

    session.last_message_at = datetime.now(timezone.utc)
    db.commit()

    return ChatRuntimeResponse(
        request_id=request_id,
        chatbot_id=str(chatbot.id),
        outcome=outcome,
        answer={"text": answer_text, "warnings": warnings},
        citations=citations,
        policy_decision={},
        trace=_build_public_runtime_trace(
            normalized_query=normalized_query,
            llm_executed=llm_executed,
            llm_error_code=llm_error_code,
            stream_mode=stream_mode,
            user_message_id=str(user_message.id),
            assistant_message_id=str(assistant_message.id),
            session_id=str(session.id),
            session_token=session_token,
        ),
    )
