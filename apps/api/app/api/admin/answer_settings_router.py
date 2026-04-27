from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal, require_institution_admin_auth
from app.db import get_db_session
from app.schemas.answer_settings import AnswerSettingsResponse, AnswerSettingsUpsertRequest
from app.services.settings.answer_settings_service import get_answer_settings, update_answer_settings

router = APIRouter(tags=["admin-answer-settings"])


@router.get("/chatbots/{chatbot_id}/answer-settings", response_model=AnswerSettingsResponse)
def admin_get_answer_settings(
    chatbot_id: str,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AnswerSettingsResponse:
    return get_answer_settings(db, principal=principal, chatbot_id=chatbot_id)


@router.put("/chatbots/{chatbot_id}/answer-settings", response_model=AnswerSettingsResponse)
def admin_put_answer_settings(
    chatbot_id: str,
    body: AnswerSettingsUpsertRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AnswerSettingsResponse:
    return update_answer_settings(db, principal=principal, chatbot_id=chatbot_id, body=body)


@router.patch("/chatbots/{chatbot_id}/answer-settings", response_model=AnswerSettingsResponse)
def admin_patch_answer_settings(
    chatbot_id: str,
    body: AnswerSettingsUpsertRequest,
    principal: AdminPrincipal = Depends(require_institution_admin_auth),
    db: Session = Depends(get_db_session),
) -> AnswerSettingsResponse:
    return update_answer_settings(db, principal=principal, chatbot_id=chatbot_id, body=body)
