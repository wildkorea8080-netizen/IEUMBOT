import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AdminPrincipal
from app.core.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.models import Organization, SystemApiConfig
from app.repositories.logs.audit_log_repository import create_audit_log
from app.repositories.super_admin.api_configs_repository import (
    get_api_config_by_id,
    list_api_configs,
    summarize_api_usage,
    unset_default_api_configs,
)
from app.repositories.super_admin.api_usage_repository import (
    list_recent_api_errors,
    list_usage_by_chatbot,
    list_usage_by_organization,
)
from app.schemas.super_admin_api_configs import (
    AdminApiUsageSummaryResponse,
    SuperAdminApiConfigCreateRequest,
    SuperAdminApiConfigItem,
    SuperAdminApiConfigListResponse,
    SuperAdminApiConfigUpdateRequest,
    SuperAdminApiUsageByChatbotItem,
    SuperAdminApiUsageByChatbotResponse,
    SuperAdminApiUsageByOrganizationItem,
    SuperAdminApiUsageByOrganizationResponse,
    SuperAdminApiUsageErrorItem,
    SuperAdminApiUsageErrorsResponse,
    SuperAdminApiUsageSummaryResponse,
)
from app.services.llm_api_config_runtime_service import clear_runtime_api_config_cache

ALLOWED_PROVIDERS = {"openai", "azure_openai", "anthropic", "custom"}


def _validate_uuid_or_404(value: str, detail: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


def _normalize_provider(value: str) -> str:
    normalized = value.strip()
    if normalized not in ALLOWED_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="INVALID_PROVIDER")
    return normalized


def _normalize_display_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="DISPLAY_NAME_REQUIRED")
    return normalized


def _masked_key_status(row: SystemApiConfig) -> tuple[str, str]:
    try:
        return mask_secret(decrypt_secret(row.api_key_encrypted)), "valid"
    except ValueError:
        return "복호화 실패 - API 키를 다시 저장해 주세요", "invalid_encryption"


def _to_item(row: SystemApiConfig) -> SuperAdminApiConfigItem:
    masked_key, key_status = _masked_key_status(row)
    return SuperAdminApiConfigItem(
        id=str(row.id),
        provider=row.provider,
        display_name=row.display_name,
        base_url=row.base_url,
        default_model=row.default_model,
        fast_model=getattr(row, "fast_model", None),
        embedding_model=row.embedding_model,
        is_active=row.is_active,
        is_default=row.is_default,
        masked_key=masked_key,
        key_status=key_status,
        monthly_budget_limit=row.monthly_budget_limit,
        memo=row.memo,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _resolve_audit_organization_id(db: Session) -> str:
    row = db.execute(select(Organization.id).order_by(Organization.created_at.asc()).limit(1)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ORGANIZATION_REQUIRED_FOR_AUDIT")
    return str(row)


def _audit(
    db: Session,
    *,
    principal: AdminPrincipal,
    action: str,
    target_id: str,
    metadata_json: dict,
) -> None:
    create_audit_log(
        db,
        organization_id=_resolve_audit_organization_id(db),
        admin_id=principal.admin_id,
        action=action,
        target_type="system_api_config",
        target_id=target_id,
        result="success",
        request_id=None,
        metadata_json=metadata_json,
    )


def list_api_configs_service(db: Session, *, principal: AdminPrincipal) -> SuperAdminApiConfigListResponse:
    _ = principal
    rows = list_api_configs(db)
    return SuperAdminApiConfigListResponse(items=[_to_item(row) for row in rows])


def get_api_config_detail_service(db: Session, *, principal: AdminPrincipal, config_id: str) -> SuperAdminApiConfigItem:
    _ = principal
    config_id = _validate_uuid_or_404(config_id, "API_CONFIG_NOT_FOUND")
    row = get_api_config_by_id(db, config_id=config_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API_CONFIG_NOT_FOUND")
    return _to_item(row)


def create_api_config_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    body: SuperAdminApiConfigCreateRequest,
) -> SuperAdminApiConfigItem:
    api_key = body.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="API_KEY_REQUIRED")
    if body.is_default:
        unset_default_api_configs(db)

    row = SystemApiConfig(
        provider=_normalize_provider(body.provider),
        display_name=_normalize_display_name(body.display_name),
        api_key_encrypted=encrypt_secret(api_key),
        base_url=body.base_url.strip() if body.base_url else None,
        default_model=body.default_model.strip() if body.default_model else None,
        fast_model=body.fast_model.strip() if body.fast_model else None,
        embedding_model=body.embedding_model.strip() if body.embedding_model else None,
        is_active=body.is_active,
        is_default=body.is_default,
        monthly_budget_limit=body.monthly_budget_limit,
        memo=body.memo.strip() if body.memo else None,
    )
    db.add(row)
    db.flush()
    _audit(
        db,
        principal=principal,
        action="super_admin.api_config.create",
        target_id=str(row.id),
        metadata_json={"provider": row.provider, "displayName": row.display_name, "isDefault": row.is_default},
    )
    db.commit()
    clear_runtime_api_config_cache(str(row.id))
    db.refresh(row)
    item = _to_item(row)
    item.masked_key = mask_secret(api_key)
    return item


def update_api_config_service(
    db: Session,
    *,
    principal: AdminPrincipal,
    config_id: str,
    body: SuperAdminApiConfigUpdateRequest,
) -> SuperAdminApiConfigItem:
    config_id = _validate_uuid_or_404(config_id, "API_CONFIG_NOT_FOUND")
    row = get_api_config_by_id(db, config_id=config_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API_CONFIG_NOT_FOUND")

    _, current_key_status = _masked_key_status(row)
    if current_key_status == "invalid_encryption" and not (body.api_key and body.api_key.strip()):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="API_KEY_REENCRYPT_REQUIRED")

    if body.is_default:
        unset_default_api_configs(db, exclude_config_id=config_id)

    if body.provider is not None:
        row.provider = _normalize_provider(body.provider)
    if body.display_name is not None:
        row.display_name = _normalize_display_name(body.display_name)
    if body.api_key is not None and body.api_key.strip():
        row.api_key_encrypted = encrypt_secret(body.api_key.strip())
        clear_runtime_api_config_cache(config_id)
    if body.base_url is not None:
        row.base_url = body.base_url.strip() or None
    if body.default_model is not None:
        row.default_model = body.default_model.strip() or None
    if body.fast_model is not None:
        row.fast_model = body.fast_model.strip() or None
    if body.embedding_model is not None:
        row.embedding_model = body.embedding_model.strip() or None
    if body.is_active is not None:
        row.is_active = body.is_active
    if body.is_default is not None:
        row.is_default = body.is_default
    if body.monthly_budget_limit is not None:
        row.monthly_budget_limit = body.monthly_budget_limit
    if body.memo is not None:
        row.memo = body.memo.strip() or None

    _audit(
        db,
        principal=principal,
        action="super_admin.api_config.update",
        target_id=str(row.id),
        metadata_json={"provider": row.provider, "displayName": row.display_name},
    )
    db.commit()
    clear_runtime_api_config_cache(config_id)
    db.refresh(row)
    item = _to_item(row)
    if body.api_key:
        item.masked_key = mask_secret(body.api_key.strip())
    return item


def activate_api_config_service(db: Session, *, principal: AdminPrincipal, config_id: str) -> SuperAdminApiConfigItem:
    config_id = _validate_uuid_or_404(config_id, "API_CONFIG_NOT_FOUND")
    row = get_api_config_by_id(db, config_id=config_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API_CONFIG_NOT_FOUND")
    row.is_active = True
    _audit(db, principal=principal, action="super_admin.api_config.activate", target_id=str(row.id), metadata_json={})
    db.commit()
    clear_runtime_api_config_cache(config_id)
    db.refresh(row)
    return _to_item(row)


def deactivate_api_config_service(db: Session, *, principal: AdminPrincipal, config_id: str) -> SuperAdminApiConfigItem:
    config_id = _validate_uuid_or_404(config_id, "API_CONFIG_NOT_FOUND")
    row = get_api_config_by_id(db, config_id=config_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API_CONFIG_NOT_FOUND")
    row.is_active = False
    row.is_default = False
    _audit(db, principal=principal, action="super_admin.api_config.deactivate", target_id=str(row.id), metadata_json={})
    db.commit()
    clear_runtime_api_config_cache(config_id)
    db.refresh(row)
    return _to_item(row)


def set_default_api_config_service(db: Session, *, principal: AdminPrincipal, config_id: str) -> SuperAdminApiConfigItem:
    config_id = _validate_uuid_or_404(config_id, "API_CONFIG_NOT_FOUND")
    row = get_api_config_by_id(db, config_id=config_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API_CONFIG_NOT_FOUND")
    unset_default_api_configs(db, exclude_config_id=config_id)
    row.is_default = True
    row.is_active = True
    _audit(db, principal=principal, action="super_admin.api_config.set_default", target_id=str(row.id), metadata_json={})
    db.commit()
    clear_runtime_api_config_cache(config_id)
    db.refresh(row)
    return _to_item(row)


def delete_api_config_service(db: Session, *, principal: AdminPrincipal, config_id: str) -> dict[str, str]:
    config_id = _validate_uuid_or_404(config_id, "API_CONFIG_NOT_FOUND")
    row = get_api_config_by_id(db, config_id=config_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API_CONFIG_NOT_FOUND")
    _audit(
        db,
        principal=principal,
        action="super_admin.api_config.delete",
        target_id=str(row.id),
        metadata_json={"displayName": row.display_name},
    )
    db.delete(row)
    db.commit()
    clear_runtime_api_config_cache(config_id)
    return {"status": "deleted"}


def _failure_rate(total_calls: int, failed_calls: int) -> float:
    if total_calls <= 0:
        return 0.0
    return round((failed_calls / total_calls) * 100, 2)


def get_api_usage_summary_service(db: Session, *, principal: AdminPrincipal) -> SuperAdminApiUsageSummaryResponse:
    _ = principal
    summary = summarize_api_usage(db)
    total_calls = int(summary.total_calls or 0)
    failed_calls = int(summary.failed_calls or 0)
    return SuperAdminApiUsageSummaryResponse(
        total_calls=total_calls,
        total_tokens=int(summary.total_tokens or 0),
        estimated_cost=float(summary.estimated_cost or 0),
        failed_calls=failed_calls,
        failure_rate=_failure_rate(total_calls, failed_calls),
    )


def list_api_usage_by_organization_service(db: Session, *, principal: AdminPrincipal) -> SuperAdminApiUsageByOrganizationResponse:
    _ = principal
    rows = list_usage_by_organization(db)
    items = [
        SuperAdminApiUsageByOrganizationItem(
            organization_id=str(row.organization_id),
            organization_name=row.organization_name,
            total_calls=int(row.total_calls or 0),
            total_tokens=int(row.total_tokens or 0),
            estimated_cost=float(row.estimated_cost or 0),
            failed_calls=int(row.failed_calls or 0),
            failure_rate=_failure_rate(int(row.total_calls or 0), int(row.failed_calls or 0)),
        )
        for row in rows
    ]
    return SuperAdminApiUsageByOrganizationResponse(items=items)


def list_api_usage_by_chatbot_service(db: Session, *, principal: AdminPrincipal) -> SuperAdminApiUsageByChatbotResponse:
    _ = principal
    rows = list_usage_by_chatbot(db)
    items = [
        SuperAdminApiUsageByChatbotItem(
            organization_id=str(row.organization_id),
            chatbot_id=str(row.chatbot_id),
            chatbot_name=row.chatbot_name,
            total_calls=int(row.total_calls or 0),
            total_tokens=int(row.total_tokens or 0),
            estimated_cost=float(row.estimated_cost or 0),
            failed_calls=int(row.failed_calls or 0),
            failure_rate=_failure_rate(int(row.total_calls or 0), int(row.failed_calls or 0)),
        )
        for row in rows
    ]
    return SuperAdminApiUsageByChatbotResponse(items=items)


def list_api_usage_errors_service(db: Session, *, principal: AdminPrincipal) -> SuperAdminApiUsageErrorsResponse:
    _ = principal
    rows = list_recent_api_errors(db)
    items = [
        SuperAdminApiUsageErrorItem(
            id=str(log.id),
            organization_id=str(log.organization_id),
            organization_name=organization_name,
            chatbot_id=str(log.chatbot_id),
            chatbot_name=chatbot_name,
            provider=log.provider,
            model=log.model,
            operation_type=log.operation_type,
            error_code=log.error_code,
            latency_ms=log.latency_ms,
            created_at=log.created_at.isoformat(),
        )
        for log, organization_name, chatbot_name in rows
    ]
    return SuperAdminApiUsageErrorsResponse(items=items)


def get_admin_api_usage_summary_service(
    db: Session,
    *,
    organization_id: str,
) -> AdminApiUsageSummaryResponse:
    month_start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    summary = summarize_api_usage(db, organization_id=organization_id, from_date=month_start)
    total_calls = int(summary.total_calls or 0)
    failed_calls = int(summary.failed_calls or 0)
    return AdminApiUsageSummaryResponse(
        total_calls=total_calls,
        total_tokens=int(summary.total_tokens or 0),
        estimated_cost=float(summary.estimated_cost or 0),
        failed_calls=failed_calls,
        failure_rate=_failure_rate(total_calls, failed_calls),
    )
