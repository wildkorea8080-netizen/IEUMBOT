from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.admin.guardrails_repository import (
    get_guardrail_chatbot_in_scope,
    list_active_guardrail_rules,
)


def get_effective_guardrails_for_runtime(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> dict[str, Any]:
    chatbot = get_guardrail_chatbot_in_scope(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    active_rules = list_active_guardrail_rules(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )
    return {
        "chatbotId": chatbot_id,
        "guardrailPolicy": chatbot.guardrail_policy or {},
        "rules": [
            {
                "id": str(row.id),
                "ruleType": row.rule_type,
                "targetCategory": row.target_category,
                "matchMode": row.match_mode,
                "matchValue": row.match_value,
                "actionType": row.action_type,
                "severity": row.severity,
                "fallbackMessage": row.fallback_message,
                "escalationMessage": row.escalation_message,
                "priority": int(row.priority),
                "metadataJson": row.metadata_json or {},
            }
            for row in active_rules
        ],
    }
