from typing import Any

from app.schemas.answer_settings import AnswerSettings

DEFAULT_CLARIFICATION_MESSAGE = (
    "어떤 사업이나 절차에 대해 궁금하신지 조금 더 알려주시면 더 정확히 안내드릴 수 있습니다."
)
DEFAULT_LOW_EVIDENCE_MESSAGE = (
    "등록된 자료에서 관련 정보를 충분히 찾지 못했습니다. "
    "질문을 조금 더 구체적으로 입력해주시면 다시 확인해드리겠습니다."
)


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
            safe_message = (
                answer_settings.answer_policy.fallback_message_when_insufficient_evidence
                or DEFAULT_LOW_EVIDENCE_MESSAGE
            )

    if recommended_action == "ask_clarification":
        safe_message = DEFAULT_CLARIFICATION_MESSAGE

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
