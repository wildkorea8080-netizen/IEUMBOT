from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.guardrails import (
    GuardrailRuleCreateRequest,
    GuardrailRuleListResponse,
    GuardrailRuleResponse,
    GuardrailRuleUpdateRequest,
)
from app.services.admin.guardrails_service import (
    create_guardrail,
    list_guardrails,
    remove_guardrail,
    update_guardrail,
)

router = APIRouter(tags=["admin-guardrails"])


@router.get("/chatbots/{chatbot_id}/guardrails", response_model=GuardrailRuleListResponse)
def admin_get_guardrails(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> GuardrailRuleListResponse:
    return list_guardrails(db, principal=principal, chatbot_id=chatbot_id)


@router.post("/chatbots/{chatbot_id}/guardrails", response_model=GuardrailRuleResponse)
def admin_create_guardrail(
    chatbot_id: str,
    body: GuardrailRuleCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> GuardrailRuleResponse:
    return create_guardrail(db, principal=principal, chatbot_id=chatbot_id, body=body)


@router.patch("/chatbots/{chatbot_id}/guardrails/{rule_id}", response_model=GuardrailRuleResponse)
def admin_patch_guardrail(
    chatbot_id: str,
    rule_id: str,
    body: GuardrailRuleUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> GuardrailRuleResponse:
    return update_guardrail(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
        body=body,
    )


@router.delete("/chatbots/{chatbot_id}/guardrails/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_guardrail(
    chatbot_id: str,
    rule_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> Response:
    remove_guardrail(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
