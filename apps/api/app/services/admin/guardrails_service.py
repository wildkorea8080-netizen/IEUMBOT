from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.repositories.admin.guardrails_repository import (
    create_guardrail_rule,
    delete_guardrail_rule,
    get_guardrail_rule,
    list_guardrail_rules,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.services.admin.scope_service import ensure_chatbot_in_scope, require_institution_organization_id
from app.schemas.guardrails import (
    GuardrailRuleCreateRequest,
    GuardrailRuleListResponse,
    GuardrailRuleResponse,
    GuardrailRuleUpdateRequest,
)

RESTRICTED_CATEGORY_SET = {
    "legal_judgment",
    "outcome_prediction",
    "definitive_benefit_decision",
    "unsupported_amount_confirmation",
    "unsupported_deadline_confirmation",
}
ESCALATION_TRIGGER_SET = {
    "insufficient_evidence",
    "conflict_detected",
    "restricted_topic_detected",
    "repeated_user_dissatisfaction",
    "after_hours_routing",
}
SENSITIVE_TOPIC_SET = {
    "welfare_eligibility_judgment",
    "legal_interpretation",
    "administrative_decision_prediction",
    "risky_civic_complaint_request",
}
RESPONSE_CONSTRAINT_SET = {
    "cautious_wording",
    "warning_notice",
    "escalation_suggestion",
    "clarification_required",
}
RULE_TYPE_ALLOWED_ACTIONS = {
    "restricted_category": {"restricted", "escalate", "fallback"},
    "forbidden_phrase": {"restricted", "fallback", "ask_clarification", "warn"},
    "escalation_trigger": {"escalate", "ask_clarification", "fallback"},
    "sensitive_topic": {"restricted", "escalate", "ask_clarification"},
    "response_constraint": {"warn", "require_cautious_wording", "ask_clarification", "escalate"},
}


def _to_rule_response(row: Any) -> GuardrailRuleResponse:
    return GuardrailRuleResponse(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        rule_type=row.rule_type,
        target_category=row.target_category,
        match_mode=row.match_mode,
        match_value=row.match_value,
        action_type=row.action_type,
        severity=row.severity,
        fallback_message=row.fallback_message,
        escalation_message=row.escalation_message,
        priority=int(row.priority),
        is_active=row.is_active,
        metadata_json=row.metadata_json or {},
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _validate_category_and_action(
    *,
    rule_type: str,
    target_category: str | None,
    action_type: str,
    match_mode: str,
    match_value: str | None,
) -> None:
    allowed_actions = RULE_TYPE_ALLOWED_ACTIONS.get(rule_type)
    if not allowed_actions:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_RULE_TYPE")
    if action_type not in allowed_actions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="INVALID_ACTION_TYPE_FOR_RULE_TYPE",
        )

    if rule_type == "restricted_category":
        if target_category not in RESTRICTED_CATEGORY_SET:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_TARGET_CATEGORY")
    elif rule_type == "escalation_trigger":
        if target_category not in ESCALATION_TRIGGER_SET:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_TARGET_CATEGORY")
    elif rule_type == "sensitive_topic":
        if target_category not in SENSITIVE_TOPIC_SET:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_TARGET_CATEGORY")
    elif rule_type == "response_constraint":
        if target_category not in RESPONSE_CONSTRAINT_SET:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_TARGET_CATEGORY")

    if rule_type == "forbidden_phrase":
        if not (match_value and str(match_value).strip()):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="FORBIDDEN_PHRASE_REQUIRES_MATCH_VALUE",
            )
        if match_mode == "context_flag":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="FORBIDDEN_PHRASE_CONTEXT_FLAG_NOT_ALLOWED",
            )

    if match_mode in {"contains", "exact", "keyword_any"} and not (match_value and str(match_value).strip()):
        if rule_type in {"forbidden_phrase", "response_constraint"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="MATCH_VALUE_REQUIRED_FOR_MATCH_MODE",
            )


def list_guardrails(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> GuardrailRuleListResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    rows = list_guardrail_rules(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )
    return GuardrailRuleListResponse(rules=[_to_rule_response(row) for row in rows])


def create_guardrail(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: GuardrailRuleCreateRequest,
) -> GuardrailRuleResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    _validate_category_and_action(
        rule_type=body.rule_type,
        target_category=body.target_category,
        action_type=body.action_type,
        match_mode=body.match_mode,
        match_value=body.match_value,
    )

    row = create_guardrail_rule(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        created_by_admin_id=principal.admin_id,
        rule_type=body.rule_type,
        target_category=body.target_category,
        match_mode=body.match_mode,
        match_value=body.match_value.strip() if body.match_value else None,
        action_type=body.action_type,
        severity=body.severity,
        fallback_message=body.fallback_message.strip() if body.fallback_message else None,
        escalation_message=body.escalation_message.strip() if body.escalation_message else None,
        priority=int(body.priority),
        is_active=body.is_active,
        metadata_json=body.metadata_json,
    )
    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.guardrails.create",
        target_type="guardrail_rule",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "ruleType": row.rule_type,
            "targetCategory": row.target_category,
            "actionType": row.action_type,
            "severity": row.severity,
            "isActive": row.is_active,
            "priority": row.priority,
        },
    )
    db.commit()
    db.refresh(row)
    return _to_rule_response(row)


def update_guardrail(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    rule_id: str,
    body: GuardrailRuleUpdateRequest,
) -> GuardrailRuleResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    row = get_guardrail_rule(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GUARDRAIL_RULE_NOT_FOUND")

    next_rule_type = row.rule_type
    next_target_category = body.target_category if body.target_category is not None else row.target_category
    next_action_type = body.action_type if body.action_type is not None else row.action_type
    next_match_mode = body.match_mode if body.match_mode is not None else row.match_mode
    next_match_value = body.match_value if body.match_value is not None else row.match_value

    _validate_category_and_action(
        rule_type=next_rule_type,
        target_category=next_target_category,
        action_type=next_action_type,
        match_mode=next_match_mode,
        match_value=next_match_value,
    )

    changed_fields: list[str] = []
    for field_name in [
        "target_category",
        "match_mode",
        "match_value",
        "action_type",
        "severity",
        "fallback_message",
        "escalation_message",
        "priority",
        "is_active",
        "metadata_json",
    ]:
        value = getattr(body, field_name)
        if value is not None:
            if isinstance(value, str):
                value = value.strip()
            setattr(row, field_name, value)
            changed_fields.append(field_name)

    db.flush()
    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.guardrails.update",
        target_type="guardrail_rule",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "changedFields": changed_fields,
            "ruleType": row.rule_type,
            "actionType": row.action_type,
            "isActive": row.is_active,
        },
    )
    db.commit()
    db.refresh(row)
    return _to_rule_response(row)


def remove_guardrail(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    rule_id: str,
) -> None:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    affected = delete_guardrail_rule(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
    )
    if affected == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GUARDRAIL_RULE_NOT_FOUND")
    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.guardrails.delete",
        target_type="guardrail_rule",
        target_id=rule_id,
        result="success",
        request_id=None,
        metadata_json={},
    )
    db.commit()
