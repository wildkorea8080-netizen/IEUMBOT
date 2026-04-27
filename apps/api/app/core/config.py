from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_name: str = "IEUMBOT API"
    api_env: str = "local"
    api_port: int = 8000
    api_log_level: str = "INFO"
    api_allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    api_database_url: str = "postgresql+psycopg://ieumbot:ieumbot@postgres:5432/ieumbot"
    api_redis_url: str = "redis://redis:6379/0"
    api_openai_api_key: str = ""
    api_api_config_encryption_secret: str = ""
    api_session_secret: str = "change-me"
    api_access_token_expire_minutes: int = 60 * 12
    api_supported_model_names: list[str] = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("api_allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: Any) -> list[str]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
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
