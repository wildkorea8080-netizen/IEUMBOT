from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.admin.escalations_repository import (
    get_escalation_chatbot_in_scope,
    list_active_escalation_rules,
)


def get_effective_escalation_rules_for_runtime(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> dict[str, Any]:
    chatbot = get_escalation_chatbot_in_scope(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )
    if chatbot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    rules = list_active_escalation_rules(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )

    return {
        "chatbotId": chatbot_id,
        "rules": [
            {
                "id": str(rule.id),
                "triggerType": rule.trigger_type,
                "triggerCondition": rule.trigger_condition,
                "targetDepartment": rule.target_department,
                "targetQueue": rule.target_queue,
                "fallbackMessage": rule.fallback_message,
                "category": rule.category,
                "priority": int(rule.priority),
                "isActive": bool(rule.is_active),
                "metadataJson": rule.metadata_json or {},
            }
            for rule in rules
        ],
    }


def map_escalation_target_for_runtime(
    *,
    policy_decision: dict[str, Any],
    runtime_escalation_config: dict[str, Any],
) -> dict[str, Any]:
    trigger_type = None
    decision = str(policy_decision.get("decision") or "")
    flags = policy_decision.get("flags") or {}
    if not isinstance(flags, dict):
        flags = {}

    if decision == "insufficient_evidence":
        trigger_type = "insufficient_evidence"
    elif decision == "restricted":
        trigger_type = "restricted_topic"
    elif decision == "conflict":
        trigger_type = "conflict_detected"
    elif decision == "escalate":
        if bool(flags.get("afterHours")):
            trigger_type = "after_hours"
        elif bool(flags.get("repeatedUserDissatisfaction")):
            trigger_type = "repeated_dissatisfaction"
        elif bool(flags.get("restrictedTopic")):
            trigger_type = "restricted_topic"
        elif bool(flags.get("conflictDetected")):
            trigger_type = "conflict_detected"
        elif bool(flags.get("missingEvidence")):
            trigger_type = "insufficient_evidence"
        else:
            trigger_type = "manual_operator_review"

    rules = runtime_escalation_config.get("rules") or []
    matched = [rule for rule in rules if rule.get("isActive", True) and rule.get("triggerType") == trigger_type]
    if matched:
        matched.sort(key=lambda item: int(item.get("priority") or 100))
        rule = matched[0]
        if rule.get("fallbackMessage") and not policy_decision.get("safeMessage"):
            policy_decision["safeMessage"] = rule.get("fallbackMessage")
        return {
            "triggerType": trigger_type,
            "ruleId": rule.get("id"),
            "targetDepartment": rule.get("targetDepartment"),
            "targetQueue": rule.get("targetQueue"),
            "fallbackMessage": rule.get("fallbackMessage"),
        }

    return {
        "triggerType": trigger_type,
        "ruleId": None,
        "targetDepartment": None,
        "targetQueue": None,
        "fallbackMessage": None,
    }
