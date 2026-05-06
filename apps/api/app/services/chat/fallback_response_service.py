from typing import Any

from app.schemas.answer_settings import AnswerSettings

DEFAULT_CLARIFICATION_MESSAGE = "정확히 안내하려면 궁금하신 대상, 기간, 신청 방법 중 어떤 부분인지 조금만 더 알려주세요."
DEFAULT_LOW_EVIDENCE_MESSAGE = (
    "현재 확인 가능한 근거가 충분하지 않아 정확히 단정해 안내하기는 어렵습니다. "
    "공식 홈페이지의 최신 공지나 담당 기관 확인이 필요할 수 있습니다."
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
