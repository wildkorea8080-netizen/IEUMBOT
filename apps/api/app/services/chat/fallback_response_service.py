from typing import Any

from app.schemas.answer_settings import AnswerSettings

DEFAULT_CLARIFICATION_MESSAGE = (
    "어떤 사업이나 절차에 대해 궁금하신지 조금 더 알려주시면 더 정확히 안내드릴 수 있습니다."
)
DEFAULT_LOW_EVIDENCE_MESSAGE = (
    "등록된 자료에서 관련 정보를 충분히 찾지 못했습니다. "
    "질문을 조금 더 구체적으로 입력해주시면 다시 확인해드리겠습니다."
)
# 검색 자체가 불가능했던 경우. 자료 탓으로 돌리면 담당자가 없는 문제를
# 찾아 자료를 뒤지게 된다 — 실제로 크레딧 소진 장애 때 그렇게 됐다.
SERVICE_UNAVAILABLE_MESSAGE = (
    "지금은 답변을 준비할 수 없습니다. 잠시 후 다시 시도해 주세요. "
    "계속 같은 화면이 나오면 담당 부서로 문의해 주세요."
)

# 검색 단계가 아예 수행되지 못한 이유들. 자료 부족과 구분해야 한다.
SERVICE_FAILURE_REASONS = frozenset({"EMBEDDING_FAILED", "RETRIEVAL_ERROR"})


def build_fallback_response(
    *,
    policy_decision: dict[str, Any],
    answer_settings: AnswerSettings,
    retrieval_failure_reason: str | None = None,
) -> dict[str, Any]:
    """근거 없이 내보낼 안내문을 만든다.

    retrieval_failure_reason 이 서비스 장애를 가리키면 "자료를 찾지 못했다"
    대신 장애 안내를 낸다. 임베딩이 죽어 검색이 실행조차 못 된 상황과
    자료가 실제로 없는 상황은 이용자에게도 담당자에게도 다른 이야기다.
    """
    decision = str(policy_decision.get("decision") or "insufficient_evidence")
    recommended_action = str(policy_decision.get("recommendedAction") or "fallback")
    safe_message = policy_decision.get("safeMessage")

    if retrieval_failure_reason in SERVICE_FAILURE_REASONS:
        return {
            "outcome": "escalate",
            "text": SERVICE_UNAVAILABLE_MESSAGE,
            "warnings": ["RETRIEVAL_SERVICE_UNAVAILABLE"],
            "llmExecuted": False,
        }

    if not safe_message:
        if (
            recommended_action == "escalate"
            and answer_settings.escalation_operating.enable_escalation_suggestion
        ):
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
