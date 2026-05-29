"""Health check 엔드포인트.

- /api/health        : liveness probe — 프로세스가 살아있으면 200. DB/외부 의존성 확인 X.
- /api/health/ready  : readiness probe — DB ping + Redis ping(있을 때) 통과해야 200.
                       실패 시 503 → Coolify 로드밸런서가 트래픽 차단 + 자동 재시작 트리거.
"""

import logging

from fastapi import APIRouter, Response, status
from sqlalchemy import text as sql_text

from app.schemas import ApiSchema

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])

_PING_TIMEOUT_SECONDS = 1.0


class HealthResponse(ApiSchema):
    status: str
    service: str


class ReadyDependencies(ApiSchema):
    postgres: str
    redis: str
    storage: str
    openai: str


class ReadyResponse(ApiSchema):
    status: str
    dependencies: ReadyDependencies


def _check_postgres() -> str:
    """`SELECT 1` 단순 ping. timeout 짧게."""
    try:
        from app.db import engine  # noqa: PLC0415

        with engine.connect() as conn:
            conn.execute(sql_text("SELECT 1"))
        return "ok"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[HEALTH] postgres ping failed: %s", exc)
        return f"error: {type(exc).__name__}"


def _check_redis() -> str:
    """Redis PING. URL 미설정/연결 실패 시 'unavailable'(503 아님 — Redis는 optional)."""
    try:
        from app.core.config import settings  # noqa: PLC0415

        if not settings.api_redis_url:
            return "unconfigured"
        import redis  # noqa: PLC0415

        client = redis.Redis.from_url(
            settings.api_redis_url,
            socket_timeout=_PING_TIMEOUT_SECONDS,
            socket_connect_timeout=_PING_TIMEOUT_SECONDS,
        )
        client.ping()
        try:
            client.close()
        except Exception:  # noqa: BLE001
            pass
        return "ok"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[HEALTH] redis ping failed: %s", exc)
        return f"unavailable: {type(exc).__name__}"


@router.get("/health")
def health() -> HealthResponse:
    """Liveness — 항상 200 (의존성 무관). 컨테이너 OOM/deadlock 감지용."""
    return HealthResponse(status="ok", service="ieumbot-api")


@router.get("/health/ready")
def ready(response: Response) -> ReadyResponse:
    """Readiness — DB는 필수, Redis는 optional.
    DB 실패 시 503 → Coolify가 트래픽 격리/재시작.
    """
    postgres_status = _check_postgres()
    redis_status = _check_redis()

    is_db_ok = postgres_status == "ok"
    if not is_db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadyResponse(
        status="ok" if is_db_ok else "degraded",
        dependencies=ReadyDependencies(
            postgres=postgres_status,
            redis=redis_status,
            storage="unknown",
            openai="unknown",
        ),
    )
