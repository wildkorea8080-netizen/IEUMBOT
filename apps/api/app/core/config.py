import json
from typing import Any

from pydantic import field_validator
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


class RawListEnvSettingsSource(EnvSettingsSource):
    raw_fields = {"api_allowed_origins", "api_supported_model_names"}

    def prepare_field_value(self, field_name: str, field: Any, value: Any, value_is_complex: bool) -> Any:
        if field_name in self.raw_fields and isinstance(value, str):
            return value
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class RawListDotEnvSettingsSource(DotEnvSettingsSource):
    raw_fields = {"api_allowed_origins", "api_supported_model_names"}

    def prepare_field_value(self, field_name: str, field: Any, value: Any, value_is_complex: bool) -> Any:
        if field_name in self.raw_fields and isinstance(value, str):
            return value
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class Settings(BaseSettings):
    api_name: str = "IEUMBOT API"
    api_env: str = "local"
    api_port: int = 8000
    api_log_level: str = "INFO"
    api_allowed_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "https://ieumbot-web.vercel.app",
    ]
    api_database_url: str = "postgresql+psycopg://ieumbot:ieumbot@postgres:5432/ieumbot"
    api_redis_url: str = "redis://redis:6379/0"
    api_openai_api_key: str = ""
    api_api_config_encryption_secret: str = ""
    api_session_secret: str = "change-me"
    api_access_token_expire_minutes: int = 60 * 12
    widget_public_api_base_url: str = "https://ieumbot-api.onrender.com/api"
    api_supported_model_names: list[str] = [
        "gpt-4.1-mini",
        "gpt-4.1",
        "gpt-4o-mini",
    ]
    api_retrieval_threshold: float = 0.55

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            RawListEnvSettingsSource(settings_cls),
            RawListDotEnvSettingsSource(settings_cls),
            file_secret_settings,
        )

    @field_validator("api_allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: Any) -> list[str]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if str(origin).strip()]
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return []

    @field_validator("api_supported_model_names", mode="before")
    @classmethod
    def parse_supported_model_names(cls, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"]


settings = Settings()
