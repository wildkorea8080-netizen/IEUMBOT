from typing import Any

CATEGORY_KEYWORDS = {
    "legal_judgment": ["위법", "합법", "법률해석", "판결", "소송"],
    "outcome_prediction": ["될까요", "선정", "당첨", "승인", "합격", "결과"],
    "definitive_benefit_decision": ["확정 지급", "반드시 지급", "무조건 지급"],
    "unsupported_amount_confirmation": ["금액 확정", "정확한 금액", "얼마나 받"],
    "unsupported_deadline_confirmation": ["마감 확정", "마감일 확정", "기한 확정"],
    "welfare_eligibility_judgment": ["복지", "수급", "자격", "요건"],
    "legal_interpretation": ["법적으로", "법 해석", "판단 부탁"],
    "administrative_decision_prediction": ["승인될", "통과될", "결과 예측"],
    "risky_civic_complaint_request": ["민원", "신고", "고발", "처벌"],
}

ACTION_PRIORITY = {
    "restricted": 100,
    "escalate": 90,
    "ask_clarification": 80,
    "fallback": 70,
    "warn": 60,
    "require_cautious_wording": 50,
}


def _keyword_any_match(text: str, raw_value: str | None) -> bool:
    if not raw_value:
        return False
    tokens = [token.strip().lower() for token in raw_value.split(",") if token.strip()]
    return any(token in text for token in tokens)


def _rule_matches(rule: dict[str, Any], *, question: str, context_flags: dict[str, Any]) -> bool:
    rule_type = rule.get("ruleType")
    target_category = rule.get("targetCategory")
    match_mode = rule.get("matchMode")
    match_value = (rule.get("matchValue") or "").strip()

    if rule_type in {"restricted_category", "sensitive_topic"} and target_category:
        keywords = CATEGORY_KEYWORDS.get(target_category, [])
        if keywords and any(keyword in question for keyword in keywords):
            return True

    if rule_type == "escalation_trigger" and target_category:
        if target_category == "insufficient_evidence" and context_flags.get("missingEvidence"):
            return True
        if target_category == "conflict_detected" and context_flags.get("conflictDetected"):
            return True
        if target_category == "restricted_topic_detected" and context_flags.get("restrictedTopic"):
            return True
        if target_category == "after_hours_routing" and context_flags.get("afterHours"):
            return True
        if target_category == "repeated_user_dissatisfaction" and context_flags.get(
            "repeatedUserDissatisfaction"
        ):
            return True

    if match_mode == "exact" and match_value:
        return question == match_value.lower()
    if match_mode == "contains" and match_value:
        return match_value.lower() in question
    if match_mode == "keyword_any":
        if _keyword_any_match(question, match_value):
            return True
    if match_mode == "context_flag":
        return _keyword_any_match(" ".join([key for key, value in context_flags.items() if value]), match_value)

    if rule_type == "forbidden_phrase" and match_value:
        return match_value.lower() in question

    return False


def evaluate_guardrails(context: dict[str, Any]) -> dict[str, Any]:
    question = str(context.get("question", "")).strip().lower()
    runtime_guardrails: dict[str, Any] = context.get("runtimeGuardrails") or {}
    flags: dict[str, Any] = context.get("flags") or {}

    rules: list[dict[str, Any]] = runtime_guardrails.get("rules") or []
    matched_rules: list[dict[str, Any]] = []

    for rule in rules:
        if _rule_matches(rule, question=question, context_flags=flags):
            matched_rules.append(
                {
                    "ruleId": rule.get("id"),
                    "ruleType": rule.get("ruleType"),
                    "targetCategory": rule.get("targetCategory"),
                    "actionType": rule.get("actionType"),
                    "severity": rule.get("severity"),
                    "fallbackMessage": rule.get("fallbackMessage"),
                    "escalationMessage": rule.get("escalationMessage"),
                    "priority": int(rule.get("priority") or 100),
                }
            )

    if not matched_rules:
        return {
            "matched": False,
            "matchedRuleIds": [],
            "matchedRules": [],
            "finalAction": None,
            "safeMessage": None,
            "requiresCautiousWording": False,
            "requiresWarningNotice": False,
        }

    matched_rules.sort(
        key=lambda item: (
            -ACTION_PRIORITY.get(item.get("actionType"), 0),
            -int(item.get("priority") or 100),
        )
    )
    top_rule = matched_rules[0]
    action = str(top_rule.get("actionType"))
    safe_message = top_rule.get("escalationMessage") or top_rule.get("fallbackMessage")

    return {
        "matched": True,
        "matchedRuleIds": [item["ruleId"] for item in matched_rules if item.get("ruleId")],
        "matchedRules": matched_rules,
        "finalAction": action,
        "safeMessage": safe_message,
        "requiresCautiousWording": any(
            item.get("actionType") == "require_cautious_wording" for item in matched_rules
        ),
        "requiresWarningNotice": any(item.get("actionType") == "warn" for item in matched_rules),
    }
