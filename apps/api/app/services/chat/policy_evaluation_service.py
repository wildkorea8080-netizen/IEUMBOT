from datetime import date
from typing import Any

from app.schemas.answer_settings import AnswerSettings
from app.services.guardrails.evaluation_service import evaluate_guardrails

CONFLICT_KEYWORD_PAIRS = [
    ("가능", "불가"),
    ("허용", "제한"),
    ("필수", "선택"),
    ("대상", "비대상"),
]

LATEST_QUERY_KEYWORDS = ["최신", "최근", "현재", "변경", "개정", "업데이트"]
OUTCOME_PREDICTION_KEYWORDS = ["될까요", "가능할까요", "당첨", "선정", "승인", "합격", "결과"]
LEGAL_JUDGMENT_KEYWORDS = ["위법", "합법", "법적으로", "법률해석", "소송", "판결"]
DEFINITIVE_CLAIM_KEYWORDS = ["확정", "무조건", "반드시", "100%"]
SLOT_KEYWORDS = {
    "조건": ["조건", "자격", "요건"],
    "기간": ["기간", "기한", "마감", "일정"],
    "대상": ["대상", "신청자", "지원대상"],
    "방법": ["방법", "절차", "신청", "접수"],
}
GREETING_KEYWORDS = [
    "안녕",
    "안녕하세요",
    "반가워",
    "반갑습니다",
    "hi",
    "hello",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
]
DOMAIN_KEYWORDS = [
    "해외농업",
    "농업개발",
    "해외 농업",
    "농업",
    "oa",
    "oads",
    "협회",
    "지원",
    "사업",
    "문의",
    "신청",
    "교육",
    "연수",
    "정책",
]


def _contains_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def _detect_conflict(candidates: list[dict[str, Any]]) -> bool:
    top = candidates[:3]
    if len(top) < 2:
        return False
    signals = []
    for item in top:
        signal_text = (
            f"{item.get('documentName', '')} "
            f"{item.get('sectionTitle', '')} "
            f"{item.get('contentSignals', {}).get('textPreview', '')}"
        ).lower()
        signals.append(signal_text)

    for left, right in CONFLICT_KEYWORD_PAIRS:
        has_left = any(left in text for text in signals)
        has_right = any(right in text for text in signals)
        if has_left and has_right:
            return True
    return False


def _coverage_score(candidates: list[dict[str, Any]]) -> dict[str, bool]:
    merged_text = " ".join(
        [
            f"{item.get('documentName', '')} {item.get('sectionTitle', '')} {item.get('contentSignals', {}).get('textPreview', '')}"
            for item in candidates[:5]
        ]
    ).lower()
    return {slot: _contains_any(merged_text, keywords) for slot, keywords in SLOT_KEYWORDS.items()}


def _is_greeting(question: str) -> bool:
    normalized = " ".join(question.strip().lower().split())
    if not normalized:
        return False
    if normalized in {"hi", "hello", "hey", "안녕", "안녕하세요"}:
        return True
    return any(keyword in normalized for keyword in GREETING_KEYWORDS)


def evaluate_answer_policy(context: dict[str, Any]) -> dict[str, Any]:
    question = str(context.get("question", "")).strip().lower()
    candidates: list[dict[str, Any]] = context.get("retrievedCandidates", [])
    answer_settings: AnswerSettings = context["answerSettings"]
    answer_validation_policy: dict[str, Any] = context.get("answerValidationPolicy", {}) or {}

    min_valid_sources = int(answer_validation_policy.get("minValidSources", 2))
    min_combined_score = float(answer_validation_policy.get("minCombinedScore", 0.2))
    unrelated_combined_score_threshold = float(answer_validation_policy.get("unrelatedCombinedScoreThreshold", 0.08))
    today = date.today()

    valid_candidates = []
    outdated_risk = False
    citation_ready_count = 0
    top_combined_score = 0.0
    domain_keyword_matched = _contains_any(question, DOMAIN_KEYWORDS)
    greeting_detected = _is_greeting(question)

    for item in candidates:
        combined_score = float(item.get("combinedScore", 0.0))
        if combined_score > top_combined_score:
            top_combined_score = combined_score
        effective_date = item.get("effectiveDate")
        expiration_date = item.get("expirationDate")

        is_effective_ok = True
        if effective_date:
            try:
                is_effective_ok = date.fromisoformat(effective_date) <= today
            except ValueError:
                is_effective_ok = False
        is_not_expired = True
        if expiration_date:
            try:
                is_not_expired = date.fromisoformat(expiration_date) >= today
                if not is_not_expired:
                    outdated_risk = True
            except ValueError:
                is_not_expired = False
                outdated_risk = True

        if combined_score >= min_combined_score and is_effective_ok and is_not_expired:
            valid_candidates.append(item)
            if item.get("documentVersionId") and (item.get("pageNumber") is not None or item.get("sectionTitle")):
                citation_ready_count += 1

    evidence_empty = len(candidates) == 0
    missing_evidence = evidence_empty or len(valid_candidates) < min_valid_sources

    coverage = _coverage_score(valid_candidates)
    covered_slots = sum(1 for covered in coverage.values() if covered)
    if covered_slots < 2:
        missing_evidence = True

    conflict_detected = _detect_conflict(valid_candidates)

    if _contains_any(question, LATEST_QUERY_KEYWORDS):
        if not any(item.get("effectiveDate") for item in valid_candidates):
            outdated_risk = True

    restricted_topic = False
    if answer_settings.answer_policy.disallow_outcome_prediction and _contains_any(
        question, OUTCOME_PREDICTION_KEYWORDS
    ):
        restricted_topic = True
    if answer_settings.answer_policy.disallow_legal_judgment and _contains_any(question, LEGAL_JUDGMENT_KEYWORDS):
        restricted_topic = True
    if answer_settings.answer_policy.disallow_definitive_claims and _contains_any(
        question, DEFINITIVE_CLAIM_KEYWORDS
    ):
        restricted_topic = True

    if answer_settings.answer_policy.require_citations and citation_ready_count == 0:
        missing_evidence = True

    unrelated_question = (
        not greeting_detected
        and not domain_keyword_matched
        and top_combined_score < unrelated_combined_score_threshold
    )

    flags = {
        "missingEvidence": bool(missing_evidence),
        "conflictDetected": bool(conflict_detected),
        "outdatedRisk": bool(outdated_risk),
        "restrictedTopic": bool(restricted_topic),
        "greetingDetected": bool(greeting_detected),
        "domainKeywordMatched": bool(domain_keyword_matched),
        "unrelatedQuestion": bool(unrelated_question),
        "topCombinedScore": float(top_combined_score),
    }

    guardrail_eval = evaluate_guardrails(
        {
            "question": question,
            "runtimeGuardrails": context.get("runtimeGuardrails") or {},
            "flags": {
                **flags,
                "afterHours": context.get("afterHours", False),
                "repeatedUserDissatisfaction": context.get("repeatedUserDissatisfaction", False),
            },
        }
    )
    if guardrail_eval.get("matched"):
        final_action = guardrail_eval.get("finalAction")
        safe_message = guardrail_eval.get("safeMessage")
        if final_action == "restricted":
            return {
                "decision": "restricted",
                "reason": "가드레일 규칙에 의해 제한 응답으로 분류되었습니다.",
                "flags": flags,
                "recommendedAction": (
                    "escalate"
                    if answer_settings.escalation_operating.enable_escalation_suggestion
                    else "fallback"
                ),
                "safeMessage": safe_message
                or answer_settings.escalation_operating.escalation_fallback_message,
                "guardrailEvaluation": guardrail_eval,
            }
        if final_action == "escalate":
            return {
                "decision": "escalate",
                "reason": "가드레일 규칙에 의해 담당 부서 연결이 필요합니다.",
                "flags": flags,
                "recommendedAction": "escalate",
                "safeMessage": safe_message
                or answer_settings.escalation_operating.escalation_fallback_message,
                "guardrailEvaluation": guardrail_eval,
            }
        if final_action == "ask_clarification":
            return {
                "decision": "conflict" if conflict_detected else "insufficient_evidence",
                "reason": "가드레일 규칙에 따라 추가 확인 질문이 필요합니다.",
                "flags": flags,
                "recommendedAction": "ask_clarification",
                "safeMessage": safe_message
                or "정확한 안내를 위해 몇 가지 확인 질문이 필요합니다.",
                "guardrailEvaluation": guardrail_eval,
            }
        if final_action == "fallback":
            return {
                "decision": "insufficient_evidence",
                "reason": "가드레일 규칙에 의해 안전 안내 문구로 전환되었습니다.",
                "flags": flags,
                "recommendedAction": "fallback",
                "safeMessage": safe_message
                or answer_settings.answer_policy.fallback_message_when_insufficient_evidence,
                "guardrailEvaluation": guardrail_eval,
            }

    if restricted_topic:
        return {
            "decision": "restricted",
            "reason": "질문이 제한 주제를 포함하여 확정형 답변이 제한됩니다.",
            "flags": flags,
            "recommendedAction": (
                "escalate" if answer_settings.escalation_operating.enable_escalation_suggestion else "fallback"
            ),
            "safeMessage": answer_settings.escalation_operating.escalation_fallback_message,
            "guardrailEvaluation": guardrail_eval,
        }

    if conflict_detected:
        return {
            "decision": "conflict",
            "reason": "상위 근거 문서 간 충돌 가능성이 감지되었습니다.",
            "flags": flags,
            "recommendedAction": "ask_clarification",
            "safeMessage": "근거 간 차이가 있어 추가 확인이 필요합니다. 담당 부서 확인을 권장합니다.",
            "guardrailEvaluation": guardrail_eval,
        }

    if greeting_detected:
        return {
            "decision": "allow",
            "reason": "인사성 발화로 판단되어 자연스러운 인사 응답을 우선합니다.",
            "flags": flags,
            "recommendedAction": "answer",
            "safeMessage": None,
            "guardrailEvaluation": guardrail_eval,
        }

    if missing_evidence and answer_settings.answer_policy.disallow_answer_without_evidence:
        action = "escalate" if unrelated_question and answer_settings.escalation_operating.enable_escalation_suggestion else "fallback"
        safe_message = (
            answer_settings.escalation_operating.escalation_fallback_message
            if action == "escalate"
            else answer_settings.answer_policy.fallback_message_when_insufficient_evidence
        )
        return {
            "decision": "insufficient_evidence",
            "reason": "답변 근거가 충분하지 않아 정책상 답변 생성을 차단합니다.",
            "flags": flags,
            "recommendedAction": action,
            "safeMessage": safe_message,
            "guardrailEvaluation": guardrail_eval,
        }

    if outdated_risk and answer_settings.answer_policy.require_latest_source_check_warning_when_relevant:
        return {
            "decision": "escalate",
            "reason": "최신성/유효기간 리스크가 감지되어 추가 확인이 필요합니다.",
            "flags": flags,
            "recommendedAction": "escalate",
            "safeMessage": answer_settings.escalation_operating.escalation_fallback_message,
            "guardrailEvaluation": guardrail_eval,
        }

    return {
        "decision": "allow",
        "reason": "정책 점검 통과: 답변 생성 진행 가능",
        "flags": flags,
        "recommendedAction": "answer",
        "safeMessage": None,
        "guardrailEvaluation": guardrail_eval,
    }
