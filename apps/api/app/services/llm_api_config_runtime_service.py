import logging
from dataclasses import dataclass

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.repositories.super_admin.api_configs_repository import (
    get_default_active_api_config,
    get_latest_active_api_config,
)

logger = logging.getLogger(__name__)
_invalid_encrypted_config_ids: set[str] = set()


@dataclass
class ResolvedLLMApiConfig:
    source: str
    provider: str
    api_key: str
    base_url: str | None
    default_model: str | None
    embedding_model: str | None
    api_config_id: str | None


def resolve_runtime_api_config(db) -> ResolvedLLMApiConfig | None:
    config = get_default_active_api_config(db) or get_latest_active_api_config(db)
    if config is not None:
        config_id = str(config.id)
        if config_id in _invalid_encrypted_config_ids:
            config = None
        else:
            try:
                api_key = decrypt_secret(config.api_key_encrypted)
            except ValueError:
                _invalid_encrypted_config_ids.add(config_id)
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
