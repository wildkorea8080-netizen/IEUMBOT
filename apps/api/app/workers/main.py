"""Arq 워커 엔트리포인트.

실행:
    cd apps/api
    arq app.workers.main.WorkerSettings

태스크는 API 서비스 코드를 그대로 호출 — DB 세션은 워커가 자체 생성(SessionLocal).
"""

from __future__ import annotations

import logging
from typing import Any

from arq import cron
from arq.connections import RedisSettings

from app.api.dependencies.auth import AdminPrincipal
from app.core.config import settings

logger = logging.getLogger(__name__)


def _principal_from_dict(data: dict[str, Any]) -> AdminPrincipal:
    """직렬화된 dict → AdminPrincipal 재구성. 알 수 없는 키는 무시."""
    field_names = {f for f in AdminPrincipal.__dataclass_fields__}
    cleaned = {k: v for k, v in data.items() if k in field_names}
    return AdminPrincipal(**cleaned)


# ── Task 함수 ──────────────────────────────────────────────────────────────


async def sync_due_web_sources(ctx: dict) -> dict[str, Any]:
    """주기적 웹 소스 동기화(cron). APScheduler 대체.

    다중 인스턴스 환경에서 Arq cron은 인스턴스 간 1회 실행만 보장 → 중복 작업 방지.
    """
    import asyncio

    from app.services.admin.knowledge_sync_service import sync_all_due_web_sources

    logger.info("[ARQ_CRON] sync_due_web_sources started")
    try:
        # sync 함수이므로 워커 이벤트 루프 차단 방지
        await asyncio.to_thread(sync_all_due_web_sources)
        logger.info("[ARQ_CRON] sync_due_web_sources done")
        return {"status": "ok"}
    except Exception as exc:
        logger.exception("[ARQ_CRON] sync_due_web_sources failed: %s", exc)
        raise


async def process_reindex_job(
    ctx: dict,
    principal_dict: dict[str, Any],
    knowledge_id: str,
    job_id: str,
) -> dict[str, Any]:
    """색인/재색인 작업 — 동일 코드를 워커 컨텍스트에서 실행.

    내부 _process_reindex_job은 sync이며 자체 SessionLocal 사용. asyncio.to_thread로
    워커 이벤트 루프를 차단하지 않고 호출.
    """
    import asyncio

    from app.services.admin.knowledge_service import _process_reindex_job

    principal = _principal_from_dict(principal_dict)
    logger.info(
        "[ARQ_TASK] process_reindex_job started knowledge_id=%s job_id=%s admin_id=%s",
        knowledge_id, job_id, principal.admin_id,
    )
    try:
        await asyncio.to_thread(_process_reindex_job, principal, knowledge_id, job_id)
        logger.info("[ARQ_TASK] process_reindex_job done knowledge_id=%s job_id=%s", knowledge_id, job_id)
        return {"status": "ok", "knowledge_id": knowledge_id, "job_id": job_id}
    except Exception as exc:
        logger.exception(
            "[ARQ_TASK] process_reindex_job failed knowledge_id=%s job_id=%s error=%s",
            knowledge_id, job_id, exc,
        )
        raise


# ── Worker 설정 ───────────────────────────────────────────────────────────


async def startup(ctx: dict) -> None:
    logger.info("[ARQ_WORKER] started redis=%s", _safe_redis_dsn())


async def shutdown(ctx: dict) -> None:
    logger.info("[ARQ_WORKER] shutting down")
    # 워커가 가진 클라이언트 캐시도 정리(이벤트 루프 종료 시 안전)
    try:
        from app.services.chat.answer_generation_service import reset_llm_clients
        from app.services.embedding_service import reset_embedding_clients
        from app.services.web_fetcher import close_client

        reset_llm_clients()
        reset_embedding_clients()
        close_client()
    except Exception:
        pass


def _safe_redis_dsn() -> str:
    """비밀번호 마스킹된 Redis DSN."""
    dsn = settings.api_redis_url or ""
    if "@" in dsn:
        scheme, rest = dsn.split("://", 1)
        creds, host = rest.split("@", 1)
        return f"{scheme}://***@{host}"
    return dsn


class WorkerSettings:
    functions = [process_reindex_job, sync_due_web_sources]
    on_startup = startup
    on_shutdown = shutdown
    # Redis 연결 — settings.api_redis_url 사용
    redis_settings = RedisSettings.from_dsn(settings.api_redis_url or "redis://localhost:6379/0")
    # 동시 작업 수 — 색인은 메모리·CPU 무거우니 보수적으로
    max_jobs = 4
    # 작업 타임아웃: PDF Vision + 대량 임베딩까지 고려해 30분
    job_timeout = 30 * 60
    # 작업 결과 보관(arq 기본 keep 1일)
    keep_result = 60 * 60 * 24
    # 작업 재시도(네트워크/일시 장애 대비)
    max_tries = 3
    # Cron 작업 — 다중 인스턴스에서 Arq가 인스턴스 간 1회 실행 보장
    cron_jobs = [
        # 매시간 정각: 만료 웹 소스 동기화 (APScheduler 대체)
        cron(sync_due_web_sources, minute=0, run_at_startup=False),
    ]
