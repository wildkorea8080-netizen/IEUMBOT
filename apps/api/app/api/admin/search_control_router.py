from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.admin_search import (
    AdminSearchTestRequest,
    AdminSearchTestResponse,
    BoostRuleCreateRequest,
    ExcludeRuleCreateRequest,
    PinRuleCreateRequest,
    SearchRuleResponse,
    SearchRuleUpdateRequest,
    SearchRulesListResponse,
    SynonymCreateRequest,
    SynonymResponse,
    SynonymUpdateRequest,
)
from app.services.admin.search_control_service import (
    create_boost_rule,
    create_exclude_rule,
    create_pin_rule,
    create_synonym_rule,
    list_search_rules,
    remove_search_rule,
    remove_synonym_rule,
    run_admin_search_test,
    update_search_rule,
    update_synonym_rule,
)

router = APIRouter(tags=["admin-search"])


@router.post("/chatbots/{chatbot_id}/search/test", response_model=AdminSearchTestResponse)
def admin_search_test(
    chatbot_id: str,
    body: AdminSearchTestRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AdminSearchTestResponse:
    return run_admin_search_test(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )


@router.post("/chatbots/{chatbot_id}/search/rules/exclude", response_model=SearchRuleResponse)
def admin_create_exclude_rule(
    chatbot_id: str,
    body: ExcludeRuleCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SearchRuleResponse:
    return create_exclude_rule(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )


@router.post("/chatbots/{chatbot_id}/search/rules/boost", response_model=SearchRuleResponse)
def admin_create_boost_rule(
    chatbot_id: str,
    body: BoostRuleCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SearchRuleResponse:
    return create_boost_rule(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )


@router.post("/chatbots/{chatbot_id}/search/rules/pin", response_model=SearchRuleResponse)
def admin_create_pin_rule(
    chatbot_id: str,
    body: PinRuleCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SearchRuleResponse:
    return create_pin_rule(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )


@router.post("/chatbots/{chatbot_id}/search/rules/synonyms", response_model=SynonymResponse)
def admin_create_synonym_rule(
    chatbot_id: str,
    body: SynonymCreateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SynonymResponse:
    return create_synonym_rule(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        body=body,
    )


@router.get("/chatbots/{chatbot_id}/search/rules", response_model=SearchRulesListResponse)
def admin_list_search_rules(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SearchRulesListResponse:
    return list_search_rules(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
    )


@router.patch("/chatbots/{chatbot_id}/search/rules/{rule_id}", response_model=SearchRuleResponse)
def admin_update_search_rule(
    chatbot_id: str,
    rule_id: str,
    body: SearchRuleUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SearchRuleResponse:
    return update_search_rule(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
        body=body,
    )


@router.delete("/chatbots/{chatbot_id}/search/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_search_rule(
    chatbot_id: str,
    rule_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> Response:
    remove_search_rule(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        rule_id=rule_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/chatbots/{chatbot_id}/search/rules/synonyms/{synonym_id}", response_model=SynonymResponse)
def admin_update_synonym_rule(
    chatbot_id: str,
    synonym_id: str,
    body: SynonymUpdateRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> SynonymResponse:
    return update_synonym_rule(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        synonym_id=synonym_id,
        body=body,
    )


@router.delete(
    "/chatbots/{chatbot_id}/search/rules/synonyms/{synonym_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def admin_delete_synonym_rule(
    chatbot_id: str,
    synonym_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> Response:
    remove_synonym_rule(
        db,
        principal=principal,
        chatbot_id=chatbot_id,
        synonym_id=synonym_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
