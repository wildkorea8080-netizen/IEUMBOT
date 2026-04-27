from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.repositories.logs.chat_trace_repository import (
    get_latest_user_question_for_session,
    list_assistant_chat_messages_for_org,
)
from app.services.admin.scope_service import ensure_chatbot_in_scope, require_institution_organization_id

router = APIRouter(tags=["admin-logs"])


@router.get("/logs/chat")
def admin_list_chat_logs(
    chatbot_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    organization_id = require_institution_organization_id(principal)
    if chatbot_id:
        ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    rows = list_assistant_chat_messages_for_org(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        limit_count=limit,
    )
    items = []
    for row in rows:
        latest_user = get_latest_user_question_for_session(
            db,
            session_id=str(row.session_id),
            before_created_at=row.created_at,
        )
        final_decision = row.final_decision or {}
        if not isinstance(final_decision, dict):
            final_decision = {}
        guardrail_eval = final_decision.get("guardrailEvaluation") or {}
        if not isinstance(guardrail_eval, dict):
            guardrail_eval = {}

        items.append(
            {
                "id": str(row.id),
                "requestId": row.request_id,
                "chatbotId": str(row.chatbot_id),
                "createdAt": row.created_at.isoformat(),
                "updatedAt": row.updated_at.isoformat(),
                "metadataJson": {
                    "question": latest_user.content if latest_user else None,
                    "answer": row.content,
                    "outcome": row.result_type or "unknown",
                    "llmExecuted": bool(row.model_name),
                    "llmErrorCode": None,
                    "policyDecision": final_decision.get("decision"),
                    "reason": final_decision.get("reason"),
                    "flags": row.validation_signals or {},
                    "guardrailMatchedRuleIds": guardrail_eval.get("matchedRuleIds", []),
                    "guardrailFinalAction": guardrail_eval.get("finalAction"),
                    "retrievalSummary": (row.retrieved_documents or [])[:10],
                    "citationSummary": (row.selected_sources or [])[:10],
                    "effectiveSettingsSummary": {
                        "modelName": row.model_name,
                    },
                    "trace": {
                        "sessionId": str(row.session_id),
                        "normalizedQuery": row.normalized_query,
                        "escalationReason": row.escalation_reason,
                        "escalationTargetDepartment": row.escalation_target_department,
                        "escalationTargetQueue": row.escalation_target_queue,
                    },
                },
            }
        )

    return {"items": items}
