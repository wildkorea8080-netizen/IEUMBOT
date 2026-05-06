import logging
from dataclasses import dataclass

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.repositories.super_admin.api_configs_repository import (
    get_default_active_api_config,
    get_latest_active_api_config,
)

logger = logging.getLogger(__name__)
_invalid_encrypted_config_fingerprints: dict[str, str] = {}


@dataclass
class ResolvedLLMApiConfig:
    source: str
    provider: str
    api_key: str
    base_url: str | None
    default_model: str | None
    embedding_model: str | None
    api_config_id: str | None


@dataclass
class RuntimeApiConfigStatus:
    source: str
    provider: str | None
    api_config_id: str | None
    status: str
    detail: str | None = None
    secret_configured: bool = False


def clear_runtime_api_config_cache(config_id: str | None = None) -> None:
    if config_id is None:
        _invalid_encrypted_config_fingerprints.clear()
        return
    _invalid_encrypted_config_fingerprints.pop(config_id, None)


def inspect_runtime_api_config_status(db) -> RuntimeApiConfigStatus:
    config = get_default_active_api_config(db) or get_latest_active_api_config(db)
    if config is not None:
        config_id = str(config.id)
        encrypted_fingerprint = config.api_key_encrypted
        if _invalid_encrypted_config_fingerprints.get(config_id) == encrypted_fingerprint:
            return RuntimeApiConfigStatus(
                source="system_api_config",
                provider=config.provider,
                api_config_id=config_id,
                status="invalid_encryption",
                detail="복호화 실패",
                secret_configured=bool(settings.api_api_config_encryption_secret),
            )
        try:
            decrypt_secret(config.api_key_encrypted)
        except ValueError:
            _invalid_encrypted_config_fingerprints[config_id] = encrypted_fingerprint
            logger.warning("Failed to decrypt active LLM API config", extra={"api_config_id": config_id})
            return RuntimeApiConfigStatus(
                source="system_api_config",
                provider=config.provider,
                api_config_id=config_id,
                status="invalid_encryption",
                detail="복호화 실패",
            )
        return RuntimeApiConfigStatus(
            source="system_api_config",
            provider=config.provider,
            api_config_id=config_id,
            status="valid",
            detail=None,
            secret_configured=bool(settings.api_api_config_encryption_secret),
        )

    if settings.api_openai_api_key:
        return RuntimeApiConfigStatus(
            source="env_fallback",
            provider="openai",
            api_config_id=None,
            status="valid",
            detail="환경변수 fallback",
            secret_configured=True,
        )

    return RuntimeApiConfigStatus(
        source="missing",
        provider=None,
        api_config_id=None,
        status="missing",
        detail="활성 LLM API 설정 없음",
        secret_configured=bool(settings.api_api_config_encryption_secret),
    )


def resolve_runtime_api_config(db) -> ResolvedLLMApiConfig | None:
    config = get_default_active_api_config(db) or get_latest_active_api_config(db)
    if config is not None:
        config_id = str(config.id)
        encrypted_fingerprint = config.api_key_encrypted
        if _invalid_encrypted_config_fingerprints.get(config_id) == encrypted_fingerprint:
            config = None
        else:
            try:
                api_key = decrypt_secret(config.api_key_encrypted)
            except ValueError:
                _invalid_encrypted_config_fingerprints[config_id] = encrypted_fingerprint
                logger.warning("Failed to decrypt active LLM API config", extra={"api_config_id": config_id})
                config = None
            else:
                return ResolvedLLMApiConfig(
                    source="system_api_config",
                    provider=config.provider,
                    api_key=api_key,
                    base_url=config.base_url,
                    default_model=config.default_model,
                    embedding_model=config.embedding_model,
                    api_config_id=config_id,
                )

    if settings.api_openai_api_key:
        return ResolvedLLMApiConfig(
            source="env_fallback",
            provider="openai",
            api_key=settings.api_openai_api_key,
            base_url="https://api.openai.com/v1",
            default_model=None,
            embedding_model=None,
            api_config_id=None,
        )
    return None
