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
    api_widget_public_api_base_url: str = "https://ieumbot-api.onrender.com/api"
    api_widget_public_web_base_url: str = ""
    api_supported_model_names: list[str] = [
        "gpt-4.1-mini",
        "gpt-4.1",
        "gpt-4o-mini",
    ]
    api_retrieval_threshold: float = 0.55
    use_dynamic_followup: bool = False
    use_hybrid_search: bool = False
    use_reranking: bool = False
    rerank_top_n: int = 5
    use_query_rewriting: bool = False
    use_contextual_retrieval: bool = False
    contextual_retrieval_model: str = "gpt-4o-mini"
    contextual_retrieval_max_workers: int = 5
    use_docling: bool = False
    # Arq 워커로 색인/재색인 디스패치. False면 FastAPI BackgroundTasks(동일 프로세스)로 fallback.
    # 다중 인스턴스/Coolify 배포 시 반드시 True + Redis 가용 필수.
    use_arq_worker: bool = False
    # 시맨틱 답변 캐시 — 동일 첫턴 질문 반복 시 LLM 우회. TTL 동안 캐시된 답변 즉시 반환.
    use_answer_cache: bool = False
    answer_cache_ttl_seconds: int = 600
    # Sentry 에러/성능 트래킹 — DSN 미설정 시 SDK 초기화 skip (no-op).
    # iwinv/Coolify 배포 시 Sentry 계정 발급 후 환경변수 주입 권장.
    sentry_dsn: str = ""
    sentry_environment: str = ""
    sentry_traces_sample_rate: float = 0.0
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

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
