from copy import deepcopy
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.core.config import settings
from app.repositories.logs.audit_log_repository import create_audit_log
from app.repositories.settings.answer_settings_repository import (
    get_chatbot_settings_row,
    save_answer_settings_json,
)
from app.services.admin.scope_service import ensure_chatbot_in_scope, require_institution_organization_id
from app.schemas.answer_settings import AnswerSettings, AnswerSettingsResponse, AnswerSettingsUpsertRequest


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _get_supported_model_names() -> list[str]:
    default_models = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"]
    configured = getattr(settings, "api_supported_model_names", None)
    if isinstance(configured, list):
        filtered = [str(item).strip() for item in configured if str(item).strip()]
        return filtered or default_models
    return default_models


def _defaults_from_legacy(row: Any) -> dict[str, Any]:
    return {
        "promptInstruction": {
            "systemPrompt": row.persona or "",
            "assistantRoleMode": "policy_guide",
            "toneMode": row.tone or "polite",
            "answerStyleMode": "balanced",
            "additionalInstructions": "",
        },
        "answerPolicy": {
            "requireCitations": True,
            "disallowAnswerWithoutEvidence": True,
            "disallowDefinitiveClaims": True,
            "disallowOutcomePrediction": True,
            "disallowLegalJudgment": True,
            "requireLatestSourceCheckWarningWhenRelevant": True,
            "fallbackMessageWhenInsufficientEvidence": (
                row.fallback_message
                or "현재 확인 가능한 공식 근거가 부족하여 확정 안내가 어렵습니다. 담당 부서에 문의해 주세요."
            ),
            "clarificationStrategyMode": "ask_one_question",
        },
        "answerFormat": {
            "answerTemplateMode": "fixed_public_service",
            "maxAnswerLengthMode": row.answer_length or "medium",
            "includeConclusionSection": True,
            "includeReasonSection": True,
            "includeDetailedGuidanceSection": True,
            "includeCautionSection": True,
            "citationDisplayMode": row.citation_mode or "visible",
        },
        "modelRuntime": {
            "modelName": "gpt-4.1-mini",
            "temperature": 0.2,
            "maxTokens": 800,
        },
        "escalationOperating": {
            "enableEscalationSuggestion": True,
            "escalationFallbackMessage": "정확한 안내를 위해 담당 부서 연결을 권장합니다.",
            "operatingHoursFallbackMessage": (
                "현재 운영시간이 아니므로 즉시 연결이 어렵습니다. 운영시간에 다시 문의해 주세요."
            ),
            "afterHoursBehaviorMode": "show_notice",
        },
    }


def _collect_missing_defaults_paths(
    defaults: dict[str, Any],
    payload: dict[str, Any],
    prefix: str = "",
) -> list[str]:
    missing: list[str] = []
    for key, default_value in defaults.items():
        current_path = f"{prefix}.{key}" if prefix else key
        if key not in payload:
            missing.append(current_path)
            continue
        payload_value = payload[key]
        if isinstance(default_value, dict) and isinstance(payload_value, dict):
            missing.extend(_collect_missing_defaults_paths(default_value, payload_value, current_path))
    return missing


def _validate_and_normalize_settings(data: dict[str, Any]) -> dict[str, Any]:
    supported_models = _get_supported_model_names()
    model_name = str(data["modelRuntime"]["modelName"]).strip()
    if model_name not in supported_models:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"UNSUPPORTED_MODEL_NAME:{model_name}",
        )
    data["modelRuntime"]["modelName"] = model_name

    require_citations = bool(data["answerPolicy"]["requireCitations"])
    citation_display_mode = str(data["answerFormat"]["citationDisplayMode"])
    if require_citations and citation_display_mode == "hidden":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="INVALID_CITATION_DISPLAY_MODE_FOR_REQUIRED_CITATION",
        )

    if bool(data["answerPolicy"]["disallowAnswerWithoutEvidence"]):
        fallback = str(data["answerPolicy"]["fallbackMessageWhenInsufficientEvidence"]).strip()
        if not fallback:
            data["answerPolicy"][
                "fallbackMessageWhenInsufficientEvidence"
            ] = "현재 확인 가능한 공식 근거가 부족하여 확정 안내가 어렵습니다. 담당 부서에 문의해 주세요."
        else:
            data["answerPolicy"]["fallbackMessageWhenInsufficientEvidence"] = fallback

    if str(data["answerFormat"]["answerTemplateMode"]) == "fixed_public_service":
        data["answerFormat"]["includeConclusionSection"] = True
        data["answerFormat"]["includeReasonSection"] = True
        data["answerFormat"]["includeDetailedGuidanceSection"] = True
        data["answerFormat"]["includeCautionSection"] = True
    else:
        sections = [
            bool(data["answerFormat"]["includeConclusionSection"]),
            bool(data["answerFormat"]["includeReasonSection"]),
            bool(data["answerFormat"]["includeDetailedGuidanceSection"]),
            bool(data["answerFormat"]["includeCautionSection"]),
        ]
        if not any(sections):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="AT_LEAST_ONE_ANSWER_SECTION_REQUIRED",
            )

    data["promptInstruction"]["systemPrompt"] = str(data["promptInstruction"]["systemPrompt"]).strip()
    data["promptInstruction"]["additionalInstructions"] = str(
        data["promptInstruction"]["additionalInstructions"]
    ).strip()
    data["escalationOperating"]["escalationFallbackMessage"] = str(
        data["escalationOperating"]["escalationFallbackMessage"]
    ).strip()
    data["escalationOperating"]["operatingHoursFallbackMessage"] = str(
        data["escalationOperating"]["operatingHoursFallbackMessage"]
    ).strip()

    return data


def _to_response(
    row: Any,
    *,
    defaults_applied: list[str],
    effective_dict: dict[str, Any],
) -> AnswerSettingsResponse:
    model = AnswerSettings.model_validate(effective_dict)
    return AnswerSettingsResponse(
        chatbot_id=str(row.id),
        settings=model,
        defaults_applied=sorted(defaults_applied),
        normalized=True,
        version=int(row.settings_version),
        updated_at=row.updated_at.isoformat(),
    )


def get_answer_settings(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
) -> AnswerSettingsResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    row = get_chatbot_settings_row(db, organization_id=organization_id, chatbot_id=chatbot_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    defaults = _defaults_from_legacy(row)
    stored = row.answer_settings_json or {}
    effective = _deep_merge(defaults, stored if isinstance(stored, dict) else {})
    normalized = _validate_and_normalize_settings(effective)
    defaults_applied = _collect_missing_defaults_paths(defaults, stored if isinstance(stored, dict) else {})
    return _to_response(row, defaults_applied=defaults_applied, effective_dict=normalized)


def update_answer_settings(
    db: Session,
    *,
    principal: AdminPrincipal,
    chatbot_id: str,
    body: AnswerSettingsUpsertRequest,
) -> AnswerSettingsResponse:
    organization_id = require_institution_organization_id(principal)
    ensure_chatbot_in_scope(db, principal=principal, chatbot_id=chatbot_id)
    row = get_chatbot_settings_row(db, organization_id=organization_id, chatbot_id=chatbot_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")

    defaults = _defaults_from_legacy(row)
    payload = body.settings.model_dump(by_alias=True, exclude_unset=True)
    merged = _deep_merge(defaults, payload)
    normalized = _validate_and_normalize_settings(merged)

    old_effective = _deep_merge(defaults, row.answer_settings_json or {})
    old_flat = AnswerSettings.model_validate(old_effective).model_dump(by_alias=True)
    new_flat = AnswerSettings.model_validate(normalized).model_dump(by_alias=True)
    changed_keys = sorted([key for key in new_flat.keys() if new_flat.get(key) != old_flat.get(key)])

    save_answer_settings_json(db, row=row, answer_settings_json=new_flat)
    create_audit_log(
        db,
        organization_id=organization_id,
        admin_id=principal.admin_id,
        action="admin.answer_settings.update",
        target_type="chatbot",
        target_id=chatbot_id,
        result="success",
        request_id=None,
        metadata_json={
            "changedGroups": changed_keys,
            "newVersion": int(row.settings_version),
            "modelName": new_flat.get("modelRuntime", {}).get("modelName"),
        },
    )
    db.commit()
    db.refresh(row)

    defaults_applied = _collect_missing_defaults_paths(defaults, payload)
    return _to_response(row, defaults_applied=defaults_applied, effective_dict=new_flat)


def get_effective_answer_settings_for_runtime(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str,
) -> AnswerSettings:
    """
    Runtime-safe accessor for future chat generation pipeline integration.
    This function is intentionally server-side only and not exposed as a public widget endpoint.
    """
    row = get_chatbot_settings_row(db, organization_id=organization_id, chatbot_id=chatbot_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CHATBOT_NOT_FOUND")
    defaults = _defaults_from_legacy(row)
    stored = row.answer_settings_json if isinstance(row.answer_settings_json, dict) else {}
    effective = _deep_merge(defaults, stored)
    normalized = _validate_and_normalize_settings(effective)
    return AnswerSettings.model_validate(normalized)
