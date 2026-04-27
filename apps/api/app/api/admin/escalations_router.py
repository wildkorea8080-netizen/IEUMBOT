from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.escalations import (
    EscalationCaseDetailResponse,
    EscalationCaseListResponse,
    EscalationRuleCreateRequest,
    EscalationRuleListResponse,
    EscalationRuleResponse,
    EscalationRuleUpdateRequest,
)
from app.services.admin.escalations_service import (
    create_escalation_rule_service,
    delete_escalation_rule_service,
    get_escalated_case_detail_service,
    list_escalated_cases_service,
    list_escalation_rules_service,
    update_escalation_rule_service,
)

router = APIRouter(tags=["admin-escalations"])


@router.get("/chatbots/{chatbot_id}/escalation-rules", response_model=EscalationRuleListResponse)
def admin_get_escalation_rules(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> EscalationRuleListResponse:
    return list_escalation_rules_service(db, principal=principal, chatbot_id=chatbot_id)


@router.post("/chatbots/{chatbot_id}/escalation-rules", response_model=EscalationRuleResponse)
def admin_create_escalation_rule(
    chatbot_id: str,
    body: EscalationRuleCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> EscalationRuleResponse:
    return create_escalation_rule_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )


@router.patch("/chatbots/{chatbot_id}/escalation-rules/{rule_id}", response_model=EscalationRuleResponse)
def admin_patch_escalation_rule(
    chatbot_id: str,
    rule_id: str,
    body: EscalationRuleUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> EscalationRuleResponse:
    return update_escalation_rule_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
        body=body,
    )


@router.delete(
    "/chatbots/{chatbot_id}/escalation-rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def admin_delete_escalation_rule(
    chatbot_id: str,
    rule_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> Response:
    delete_escalation_rule_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/chatbots/{chatbot_id}/escalations", response_model=EscalationCaseListResponse)
def admin_list_escalated_cases(
    chatbot_id: str,
    reason: str | None = Query(default=None),
    target_department: str | None = Query(default=None, alias="targetDepartment"),
    target_queue: str | None = Query(default=None, alias="targetQueue"),
    outcome: str | None = Query(default=None),
    llm_executed: bool | None = Query(default=None, alias="llmExecuted"),
    from_date: str | None = Query(default=None, alias="fromDate"),
    to_date: str | None = Query(default=None, alias="toDate"),
    unresolved_only: bool = Query(default=False, alias="unresolvedOnly"),
    limit: int = Query(default=50, ge=1, le=200),
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> EscalationCaseListResponse:
    return list_escalated_cases_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        reason=reason,
        target_department=target_department,
        target_queue=target_queue,
        outcome=outcome,
        llm_executed=llm_executed,
        from_date=from_date,
        to_date=to_date,
        unresolved_only=unresolved_only,
        limit=limit,
    )


@router.get(
    "/chatbots/{chatbot_id}/escalations/{message_id}",
    response_model=EscalationCaseDetailResponse,
)
def admin_get_escalated_case_detail(
    chatbot_id: str,
    message_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> EscalationCaseDetailResponse:
    return get_escalated_case_detail_service(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        message_id=message_id,
    )
