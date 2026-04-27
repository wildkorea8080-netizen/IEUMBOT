from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.repositories.admin.escalations_repository import (
    create_escalation_rule,
    delete_escalation_rule,
    get_escalation_assistant_message_detail,
    get_escalation_rule,
    get_latest_user_message_before,
    list_citations_for_message,
    list_escalated_assistant_messages,
    list_escalation_rules,
    list_session_messages,
)
from app.repositories.logs.audit_log_repository import create_audit_log
from app.services.admin.scope_service import ensure_chatbot_in_scope, require_institution_organization_id
from app.schemas.escalations import (
    EscalationCaseDetailResponse,
    EscalationCaseListResponse,
    EscalationCaseSummary,
    EscalationCitationSummary,
    EscalationConversationTurn,
    EscalationRuleCreateRequest,
    EscalationRuleListResponse,
    EscalationRuleResponse,
    EscalationRuleUpdateRequest,
)

ESCALATION_TRIGGER_SET = {
    "insufficient_evidence",
    "restricted_topic",
    "conflict_detected",
    "after_hours",
    "repeated_dissatisfaction",
    "manual_operator_review",
}


def _to_rule_response(row: Any) -> EscalationRuleResponse:
    return EscalationRuleResponse(
        id=str(row.id),
        chatbot_id=str(row.chatbot_id),
        trigger_type=row.trigger_type,
        trigger_condition=row.trigger_condition,
        target_department=row.target_department,
        target_queue=row.target_queue,
        fallback_message=row.fallback_message,
        category=row.category,
        priority=int(row.priority),
        is_active=row.is_active,
        metadata_json=row.metadata_json or {},
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _validate_trigger_type(trigger_type: str) -> None:
    if trigger_type not in ESCALATION_TRIGGER_SET:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_TRIGGER_TYPE")


def list_escalation_rules_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> EscalationRuleListResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    rows = list_escalation_rules(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
    )
    return EscalationRuleListResponse(rules=[_to_rule_response(row) for row in rows])


def create_escalation_rule_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: EscalationRuleCreateRequest,
) -> EscalationRuleResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    _validate_trigger_type(body.trigger_type)

    row = create_escalation_rule(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        created_by_admin_id=principal.admin_id,
        trigger_type=body.trigger_type,
        trigger_condition=body.trigger_condition.strip() if body.trigger_condition else None,
        target_department=body.target_department.strip(),
        target_queue=body.target_queue.strip(),
        fallback_message=body.fallback_message.strip() if body.fallback_message else None,
        category=body.category.strip() if body.category else None,
        priority=int(body.priority),
        is_active=body.is_active,
        metadata_json=body.metadata_json,
    )

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.escalation_rules.create",
        target_type="escalation_rule",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "chatbotId": chatbot_id,
            "triggerType": row.trigger_type,
            "targetDepartment": row.target_department,
            "targetQueue": row.target_queue,
            "isActive": row.is_active,
            "priority": row.priority,
        },
    )
    db.commit()
    db.refresh(row)
    return _to_rule_response(row)


def update_escalation_rule_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    rule_id: str,
    body: EscalationRuleUpdateRequest,
) -> EscalationRuleResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    row = get_escalation_rule(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ESCALATION_RULE_NOT_FOUND")

    changed_fields: list[str] = []
    for field_name in [
        "trigger_condition",
        "target_department",
        "target_queue",
        "fallback_message",
        "category",
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

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.escalation_rules.update",
        target_type="escalation_rule",
        target_id=str(row.id),
        result="success",
        request_id=None,
        metadata_json={
            "changedFields": changed_fields,
            "chatbotId": chatbot_id,
            "triggerType": row.trigger_type,
            "targetDepartment": row.target_department,
            "targetQueue": row.target_queue,
            "isActive": row.is_active,
        },
    )
    db.commit()
    db.refresh(row)
    return _to_rule_response(row)


def delete_escalation_rule_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    rule_id: str,
) -> None:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    affected = delete_escalation_rule(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
    )
    if affected == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ESCALATION_RULE_NOT_FOUND")

    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.escalation_rules.delete",
        target_type="escalation_rule",
        target_id=rule_id,
        result="success",
        request_id=None,
        metadata_json={"chatbotId": chatbot_id},
    )
    db.commit()


def _to_case_summary(
    db: Session,
    *,
    message: Any,
) -> EscalationCaseSummary:
    latest_user = get_latest_user_message_before(
        db,
        session_id=str(message.session_id),
        created_at=message.created_at,
    )
    return EscalationCaseSummary(
        message_id=str(message.id),
        session_id=str(message.session_id),
        request_id=message.request_id,
        chatbot_id=str(message.chatbot_id),
        latest_user_question_preview=(latest_user.content[:120] if latest_user and latest_user.content else None),
        escalation_reason=message.escalation_reason,
        escalation_target_department=message.escalation_target_department,
        escalation_target_queue=message.escalation_target_queue,
        outcome=message.result_type,
        llm_executed=bool(message.model_name),
        created_at=message.created_at.isoformat(),
    )


def list_escalated_cases_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    reason: str | None,
    target_department: str | None,
    target_queue: str | None,
    outcome: str | None,
    llm_executed: bool | None,
    from_date: str | None,
    to_date: str | None,
    unresolved_only: bool,
    limit: int,
) -> EscalationCaseListResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)

    rows = list_escalated_assistant_messages(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        reason=reason.strip() if reason else None,
        target_department=target_department.strip() if target_department else None,
        target_queue=target_queue.strip() if target_queue else None,
        outcome=outcome,
        llm_executed=llm_executed,
        from_date=from_date,
        to_date=to_date,
        unresolved_only=unresolved_only,
        limit_count=limit,
    )
    return EscalationCaseListResponse(items=[_to_case_summary(db, message=row) for row in rows])


def get_escalated_case_detail_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    message_id: str,
) -> EscalationCaseDetailResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    row = get_escalation_assistant_message_detail(
        db,
        organization_id=organization_id,
        chatbot_id=chatbot_id,
        message_id=message_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ESCALATION_CASE_NOT_FOUND")

    latest_user = get_latest_user_message_before(
        db,
        session_id=str(row.session_id),
        created_at=row.created_at,
    )
    session_messages = list_session_messages(db, session_id=str(row.session_id), limit_count=20)
    citations = list_citations_for_message(db, chat_message_id=str(row.id))

    final_decision = row.final_decision or {}
    guardrail_eval = final_decision.get("guardrailEvaluation") if isinstance(final_decision, dict) else {}
    if not isinstance(guardrail_eval, dict):
        guardrail_eval = {}

    conversation_summary: list[EscalationConversationTurn] = [
        EscalationConversationTurn(
            role=msg.role,
            content=msg.content[:1000],
            result_type=msg.result_type,
            created_at=msg.created_at.isoformat(),
        )
        for msg in session_messages
    ]

    citation_summary: list[EscalationCitationSummary] = [
        EscalationCitationSummary(
            document_id=str(c.document_id) if c.document_id else None,
            document_version_id=str(c.document_version_id) if c.document_version_id else None,
            title=c.title,
            page_number=c.page_number,
            section_title=c.section_title,
            source_type=c.source_type,
            source_url=c.source_url,
            retrieval_rank=c.retrieval_rank,
        )
        for c in citations
    ]

    trace_summary = {
        "normalizedQuery": row.normalized_query,
        "retrievalSummary": (row.retrieved_documents or [])[:5],
        "selectedSourcesSummary": (row.selected_sources or [])[:5],
        "policyDecision": final_decision.get("decision") if isinstance(final_decision, dict) else None,
        "policyReason": final_decision.get("reason") if isinstance(final_decision, dict) else None,
        "flags": row.validation_signals or {},
        "guardrailFinalAction": guardrail_eval.get("finalAction"),
        "guardrailMatchedRuleIds": guardrail_eval.get("matchedRuleIds", []),
        "llmExecuted": bool(row.model_name),
    }

    return EscalationCaseDetailResponse(
        message_id=str(row.id),
        session_id=str(row.session_id),
        request_id=row.request_id,
        chatbot_id=str(row.chatbot_id),
        escalation_reason=row.escalation_reason,
        escalation_target_department=row.escalation_target_department,
        escalation_target_queue=row.escalation_target_queue,
        outcome=row.result_type,
        llm_executed=bool(row.model_name),
        latest_user_question=latest_user.content if latest_user else None,
        assistant_message=row.content,
        policy_decision=final_decision if isinstance(final_decision, dict) else {},
        matched_guardrails=guardrail_eval.get("matchedRuleIds", []),
        trace_summary=trace_summary,
        citations=citation_summary,
        conversation_summary=conversation_summary,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )
