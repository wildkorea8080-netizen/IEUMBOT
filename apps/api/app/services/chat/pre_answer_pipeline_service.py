import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.chat.policy_repository import get_chatbot_by_id
from app.repositories.logs.audit_log_repository import create_audit_log
from app.schemas.chat_policy import PreAnswerRequest, PreAnswerResponse
from app.services.chat.policy_evaluation_service import evaluate_answer_policy
from app.services.chat.retrieval_precheck_service import normalize_query, retrieve_for_precheck
from app.services.guardrails.runtime_guardrails_service import get_effective_guardrails_for_runtime
from app.services.settings.answer_settings_service import get_effective_answer_settings_for_runtime


def run_pre_answer_policy_hook(
    db: Session,
    *,
    body: PreAnswerRequest,
) -> PreAnswerResponse:
    chatbot = get_chatbot_by_id(db, body.chatbot_id)
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    retrieval_output = retrieve_for_precheck(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
        question=body.question,
        top_k=body.top_k,
        corpus_domain_policy=chatbot.corpus_domain_policy or {},
        search_control_policy=chatbot.search_control_policy or {},
    )

    effective_settings = get_effective_answer_settings_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )
    effective_guardrails = get_effective_guardrails_for_runtime(
        db,
        organization_id=str(chatbot.organization_id),
        chatbot_id=str(chatbot.id),
    )

    policy_decision = evaluate_answer_policy(
        {
            "question": body.question,
            "normalizedQuery": body.normalized_query or retrieval_output["normalizedQuery"],
            "retrievedCandidates": retrieval_output["candidates"],
            "appliedRules": retrieval_output["trace"],
            "answerSettings": effective_settings,
            "answerValidationPolicy": chatbot.answer_validation_policy or {},
            "guardrailPolicy": chatbot.guardrail_policy or {},
            "runtimeGuardrails": effective_guardrails,
        }
    )
    guardrail_eval = policy_decision.get("guardrailEvaluation") or {}

    request_id = f"chat_precheck_{uuid.uuid4().hex[:16]}"
    selected_documents_summary: list[dict[str, Any]] = []
    for item in retrieval_output["candidates"][:5]:
        selected_documents_summary.append(
            {
                "documentId": item["documentId"],
                "documentVersionId": item["documentVersionId"],
                "finalRank": item["finalRank"],
                "combinedScore": item["combinedScore"],
                "sourceType": item["sourceType"],
                "corpusDomain": item["corpusDomain"],
            }
        )

    create_audit_log(
        db,
        organization_id=str(chatbot.organization_id),
        admin_id=None,
        action="chat.pre_answer_policy_evaluated",
        target_type="chatbot",
        target_id=str(chatbot.id),
        result="success",
        request_id=request_id,
        metadata_json={
            "policyDecision": policy_decision.get("decision"),
            "reason": policy_decision.get("reason"),
            "flags": policy_decision.get("flags"),
            "guardrailMatchedRuleIds": guardrail_eval.get("matchedRuleIds", []),
            "guardrailFinalAction": guardrail_eval.get("finalAction"),
            "selectedDocumentsSummary": selected_documents_summary,
            "retrievalTrace": retrieval_output["trace"],
        },
    )
    db.commit()

    public_docs = []
    for item in retrieval_output["candidates"]:
        public_docs.append(
            {
                "documentId": item["documentId"],
                "documentName": item["documentName"],
                "documentVersionId": item["documentVersionId"],
                "finalRank": item["finalRank"],
                "keywordScore": item["keywordScore"],
                "vectorScore": item["vectorScore"],
                "combinedScore": item["combinedScore"],
                "sourceType": item["sourceType"],
                "corpusDomain": item["corpusDomain"],
                "effectiveDate": item.get("effectiveDate"),
                "expirationDate": item.get("expirationDate"),
            }
        )

    return PreAnswerResponse(
        request_id=request_id,
        chatbot_id=str(chatbot.id),
        normalized_query=body.normalized_query or normalize_query(body.question),
        decision=policy_decision,
        retrieved_documents=public_docs,
        policy_trace={
            "appliedRules": retrieval_output["trace"],
            "expandedTokens": retrieval_output["expandedTokens"],
            "guardrail": {
                "matchedRuleIds": guardrail_eval.get("matchedRuleIds", []),
                "finalAction": guardrail_eval.get("finalAction"),
                "requiresCautiousWording": guardrail_eval.get("requiresCautiousWording", False),
                "requiresWarningNotice": guardrail_eval.get("requiresWarningNotice", False),
            },
        },
    )
