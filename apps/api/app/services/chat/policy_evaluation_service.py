from datetime import date
from typing import Any

from app.schemas.answer_settings import AnswerSettings
from app.services.guardrails.evaluation_service import evaluate_guardrails

CONFLICT_KEYWORD_PAIRS = [
    ("가능", "불가"),
    ("허용", "제한"),
    ("필수", "선택"),
    ("무료", "유료"),
]

LATEST_QUERY_KEYWORDS = ["최신", "최근", "현재", "변경", "개정", "업데이트"]
OUTCOME_PREDICTION_KEYWORDS = ["될까요", "가능할까요", "합격", "선정", "통과", "결과"]
LEGAL_JUDGMENT_KEYWORDS = ["위법", "불법", "법적으로", "법률해석", "소송", "판결"]
DEFINITIVE_CLAIM_KEYWORDS = ["확정", "무조건", "반드시", "100%"]
SLOT_KEYWORDS = {
    "조건": ["조건", "자격", "요건"],
    "기간": ["기간", "기한", "마감", "일정"],
    "대상": ["대상", "신청자", "지원자"],
    "방법": ["방법", "절차", "신청", "접수"],
    "연락처": ["연락처", "전화", "전화번호", "문의처", "담당자", "담당부서"],
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
GRATITUDE_KEYWORDS = [
    "고마워",
    "고맙습니다",
    "감사",
    "thank you",
    "thanks",
    "thx",
]
SMALL_TALK_KEYWORDS = [
    "잘 지내",
    "잘지내",
    "어떻게 지내",
    "어떻게지내",
    "괜찮아",
    "괜찮으세요",
    "뭐해",
    "뭐 하니",
    "심심해",
    "재밌네",
    "오늘 어때",
    "주말 뭐해",
    "what's up",
    "hows it going",
    "how are you",
]
ABUSIVE_KEYWORDS = {
    "critical": ["죽어", "fuck you", "꺼져", "닥쳐", "개새끼"],
    "high": ["씨발", "시발", "병신", "bastard"],
    "medium": ["멍청", "idiot", "stupid"],
    "low": ["짜증", "답답", "별로", "이상하네"],
}
DOMAIN_KEYWORDS = [
    "민간환경조사",
    "해외인턴",
    "인턴사원",
    "해외농업",
    "농업개발",
    "해외 농업",
    "농업",
    "oa",
    "oads",
    "사업",
    "문의",
    "요청",
    "교육",
    "연수",
    "정책",
    "지원",
]


def _contains_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


STRUCTURED_QUESTION_KEYWORDS = [
    "연락처",
    "전화",
    "전화번호",
    "문의처",
    "담당자",
    "담당부서",
    "선발자격",
    "지원자격",
    "신청자격",
    "자격요건",
    "응시연령",
    "학력",
    "신청",
    "접수",
    "절차",
    "방법",
    "대상",
    "자격",
    "조건",
    "서류",
    "기간",
    "마감",
    "언제",
    "어디서",
    "가능",
    "불가",
    "요건",
]
OVERVIEW_QUESTION_KEYWORDS = [
    "주요사업",
    "사업",
    "소개",
    "개요",
    "역할",
    "기능",
    "업무",
    "서비스",
    "지원",
    "센터",
    "기관",
    "무엇",
    "어떤",
]


def _detect_conflict(candidates: list[dict[str, Any]]) -> bool:
    top = candidates[:3]
    if len(top) < 2:
        return False

    signals: list[str] = []
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


def _normalize_question(question: str) -> str:
    return " ".join(question.strip().lower().split())


def _is_structured_question(question: str) -> bool:
    normalized = _normalize_question(question)
    return _contains_any(normalized, STRUCTURED_QUESTION_KEYWORDS)


def _is_overview_question(question: str) -> bool:
    normalized = _normalize_question(question)
    return _contains_any(normalized, OVERVIEW_QUESTION_KEYWORDS)


def _is_contact_question(question: str) -> bool:
    normalized = _normalize_question(question)
    return _contains_any(normalized, SLOT_KEYWORDS["연락처"])


def _has_substantive_question_signal(question: str) -> bool:
    normalized = _normalize_question(question)
    if not normalized:
        return False
    return (
        _contains_any(normalized, STRUCTURED_QUESTION_KEYWORDS)
        or _contains_any(normalized, OVERVIEW_QUESTION_KEYWORDS)
        or _contains_any(normalized, DOMAIN_KEYWORDS)
        or "?" in normalized
    )


def _is_greeting(question: str) -> bool:
    normalized = _normalize_question(question)
    if not normalized:
        return False
    if normalized in {"hi", "hello", "hey", "안녕", "안녕하세요"}:
        return True
    if _has_substantive_question_signal(normalized):
        return False
    if len(normalized) > 24:
        return False
    return any(keyword in normalized for keyword in GREETING_KEYWORDS)


def _is_gratitude(question: str) -> bool:
    normalized = _normalize_question(question)
    if not normalized:
        return False
    if _has_substantive_question_signal(normalized):
        return False
    return any(keyword in normalized for keyword in GRATITUDE_KEYWORDS)


def _is_small_talk(question: str) -> bool:
    normalized = _normalize_question(question)
    if not normalized or len(normalized) > 40:
        return False
    if _is_greeting(normalized) or _is_gratitude(normalized):
        return False
    return any(keyword in normalized for keyword in SMALL_TALK_KEYWORDS)


def _abuse_severity_from_question(question: str) -> str | None:
    normalized = _normalize_question(question)
    if not normalized:
        return None
    for severity in ("critical", "high", "medium", "low"):
        if any(keyword in normalized for keyword in ABUSIVE_KEYWORDS[severity]):
            return severity
    return None


def evaluate_answer_policy(context: dict[str, Any]) -> dict[str, Any]:
    question = _normalize_question(str(context.get("question", "")))
    candidates: list[dict[str, Any]] = context.get("retrievedCandidates", [])
    answer_settings: AnswerSettings = context["answerSettings"]
    answer_validation_policy: dict[str, Any] = context.get("answerValidationPolicy", {}) or {}

    min_valid_sources = int(answer_validation_policy.get("minValidSources", 2))
    unrelated_combined_score_threshold = float(answer_validation_policy.get("unrelatedCombinedScoreThreshold", 0.08))
    today = date.today()

    referenceable_candidates: list[dict[str, Any]] = []
    outdated_risk = False
    citation_ready_count = 0
    top_combined_score = 0.0
    semantic_evidence_count = 0
    domain_keyword_matched = _contains_any(question, DOMAIN_KEYWORDS)
    greeting_detected = _is_greeting(question)
    gratitude_detected = _is_gratitude(question)
    small_talk_detected = _is_small_talk(question)
    structured_question = _is_structured_question(question)
    overview_question = _is_overview_question(question)
    contact_question = _is_contact_question(question)
    abusive_severity = str(context.get("abusiveSeverity") or _abuse_severity_from_question(question) or "")
    abusive_detected = bool(abusive_severity)
    repeated_user_dissatisfaction = bool(context.get("repeatedUserDissatisfaction"))
    effective_min_valid_sources = (
        1 if contact_question or (overview_question and not structured_question) else min_valid_sources
    )

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

        if is_effective_ok and is_not_expired:
            referenceable_candidates.append(item)
            if item.get("semanticEvidenceApplied") or item.get("semanticRescued"):
                semantic_evidence_count += 1
            if item.get("documentVersionId") and (item.get("pageNumber") is not None or item.get("sectionTitle")):
                citation_ready_count += 1
    evidence_empty = len(candidates) == 0
    missing_evidence = evidence_empty or len(referenceable_candidates) == 0

    coverage = _coverage_score(referenceable_candidates)
    covered_slots = sum(1 for covered in coverage.values() if covered)
    required_covered_slots = 1 if contact_question else 2
    if (
        structured_question
        and len(referenceable_candidates) < effective_min_valid_sources
        and covered_slots < required_covered_slots
        and semantic_evidence_count == 0
    ):
        missing_evidence = True

    conflict_detected = _detect_conflict(referenceable_candidates)

    if _contains_any(question, LATEST_QUERY_KEYWORDS):
        if not any(item.get("effectiveDate") for item in referenceable_candidates):
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
        and not gratitude_detected
        and not small_talk_detected
        and not domain_keyword_matched
        and top_combined_score < unrelated_combined_score_threshold
    )

    flags = {
        "missingEvidence": bool(missing_evidence),
        "conflictDetected": bool(conflict_detected),
        "outdatedRisk": bool(outdated_risk),
        "restrictedTopic": bool(restricted_topic),
        "greetingDetected": bool(greeting_detected),
        "gratitudeDetected": bool(gratitude_detected),
        "smallTalkDetected": bool(small_talk_detected),
        "abusiveDetected": bool(abusive_detected),
        "abusiveSeverity": abusive_severity or None,
        "repeatedUserDissatisfaction": bool(repeated_user_dissatisfaction),
        "domainKeywordMatched": bool(domain_keyword_matched),
        "structuredQuestion": bool(structured_question),
        "overviewQuestion": bool(overview_question),
        "contactQuestion": bool(contact_question),
        "unrelatedQuestion": bool(unrelated_question),
        "topCombinedScore": float(top_combined_score),
        "semanticEvidenceCount": int(semantic_evidence_count),
    }

    guardrail_eval = evaluate_guardrails(
        {
            "question": question,
            "runtimeGuardrails": context.get("runtimeGuardrails") or {},
            "flags": {
                **flags,
                "afterHours": context.get("afterHours", False),
                "repeatedUserDissatisfaction": repeated_user_dissatisfaction,
            },
        }
    )

    if abusive_detected:
        return {
            "decision": "restricted",
            "reason": "욕설 또는 공격적 표현이 감지되어 응답 톤을 제한합니다.",
            "flags": flags,
            "recommendedAction": "fallback",
            "safeMessage": "원활한 안내를 위해 정중한 표현으로 다시 말씀해 주세요. 업무 관련 질문은 계속 도와드릴 수 있습니다.",
            "guardrailEvaluation": guardrail_eval,
        }

    if guardrail_eval.get("matched"):
        final_action = guardrail_eval.get("finalAction")
        safe_message = guardrail_eval.get("safeMessage")
        if final_action == "restricted":
            return {
                "decision": "restricted",
                "reason": "가드레일 규칙에 따라 제한 응답으로 분류했습니다.",
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
                "reason": "가드레일 규칙에 따라 담당 부서 연결이 필요합니다.",
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
                or "어떤 사업이나 절차에 대해 궁금하신지 조금 더 알려주시면 더 정확히 안내드릴 수 있습니다.",
                "guardrailEvaluation": guardrail_eval,
            }
        if final_action == "fallback":
            return {
                "decision": "insufficient_evidence",
                "reason": "가드레일 규칙에 따라 안전 안내 문구로 전환했습니다.",
                "flags": flags,
                "recommendedAction": "fallback",
                "safeMessage": safe_message
                or answer_settings.answer_policy.fallback_message_when_insufficient_evidence,
                "guardrailEvaluation": guardrail_eval,
            }

    if restricted_topic:
        return {
            "decision": "restricted",
            "reason": "질문에 제한 주제가 포함되어 확정적 답변을 제한합니다.",
            "flags": flags,
            "recommendedAction": (
                "escalate" if answer_settings.escalation_operating.enable_escalation_suggestion else "fallback"
            ),
            "safeMessage": answer_settings.escalation_operating.escalation_fallback_message,
            "guardrailEvaluation": guardrail_eval,
        }

    if repeated_user_dissatisfaction and answer_settings.escalation_operating.enable_escalation_suggestion:
        return {
            "decision": "escalate",
            "reason": "사용자 불만이 반복되어 상담 연결을 우선합니다.",
            "flags": flags,
            "recommendedAction": "escalate",
            "safeMessage": answer_settings.escalation_operating.escalation_fallback_message,
            "guardrailEvaluation": guardrail_eval,
        }

    if conflict_detected:
        return {
            "decision": "conflict",
            "reason": "상위 근거 문서 간 충돌 가능성을 감지했습니다.",
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

    if gratitude_detected:
        return {
            "decision": "allow",
            "reason": "감사 표현으로 판단되어 짧은 응답을 허용합니다.",
            "flags": flags,
            "recommendedAction": "answer",
            "safeMessage": None,
            "guardrailEvaluation": guardrail_eval,
        }

    if small_talk_detected:
        return {
            "decision": "allow",
            "reason": "업무 외 짧은 잡담으로 판단되어 제한된 자연 응답을 허용합니다.",
            "flags": flags,
            "recommendedAction": "answer",
            "safeMessage": None,
            "guardrailEvaluation": guardrail_eval,
        }

    if missing_evidence and answer_settings.answer_policy.disallow_answer_without_evidence:
        action = (
            "escalate"
            if unrelated_question and answer_settings.escalation_operating.enable_escalation_suggestion
            else "fallback"
        )
        safe_message = (
            answer_settings.escalation_operating.escalation_fallback_message
            if action == "escalate"
            else answer_settings.answer_policy.fallback_message_when_insufficient_evidence
        )
        return {
            "decision": "insufficient_evidence",
            "reason": "답변 근거가 충분하지 않아 정확한 답변 생성을 차단합니다.",
            "flags": flags,
            "recommendedAction": action,
            "safeMessage": safe_message,
            "guardrailEvaluation": guardrail_eval,
        }

    if outdated_risk and answer_settings.answer_policy.require_latest_source_check_warning_when_relevant:
        return {
            "decision": "escalate",
            "reason": "최신성 또는 유효기간 리스크가 감지되어 추가 확인이 필요합니다.",
            "flags": flags,
            "recommendedAction": "escalate",
            "safeMessage": answer_settings.escalation_operating.escalation_fallback_message,
            "guardrailEvaluation": guardrail_eval,
        }

    return {
        "decision": "allow",
        "reason": "정책 평가를 통과해 답변 생성을 진행할 수 있습니다.",
        "flags": flags,
        "recommendedAction": "answer",
        "safeMessage": None,
        "guardrailEvaluation": guardrail_eval,
    }
