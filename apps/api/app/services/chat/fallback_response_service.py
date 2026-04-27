from typing import Any

from app.schemas.answer_settings import AnswerSettings


def build_fallback_response(
    *,
    policy_decision: dict[str, Any],
    answer_settings: AnswerSettings,
) -> dict[str, Any]:
    decision = str(policy_decision.get("decision") or "insufficient_evidence")
    recommended_action = str(policy_decision.get("recommendedAction") or "fallback")
    safe_message = policy_decision.get("safeMessage")

    if not safe_message:
        if recommended_action == "escalate" and answer_settings.escalation_operating.enable_escalation_suggestion:
            safe_message = answer_settings.escalation_operating.escalation_fallback_message
        else:
            safe_message = answer_settings.answer_policy.fallback_message_when_insufficient_evidence

    if recommended_action == "ask_clarification":
        safe_message = "정확한 안내를 위해 신청 대상/기간/신청 방법 중 어떤 항목이 필요한지 알려주세요."

    outcome_map = {
        "restricted": "restricted",
        "conflict": "conflict",
        "escalate": "escalate",
        "insufficient_evidence": "insufficient_evidence",
    }
    outcome = outcome_map.get(decision, "insufficient_evidence")
    return {
        "outcome": outcome,
        "text": safe_message,
        "warnings": [],
        "llmExecuted": False,
    }
