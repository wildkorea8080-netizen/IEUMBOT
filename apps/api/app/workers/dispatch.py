"""워커 디스패치 헬퍼 — sync 컨텍스트에서 Arq enqueue를 안전하게 수행.

FastAPI 라우터/서비스는 대부분 sync(`def`). Arq pool은 async(`await pool.enqueue_job`).
이 모듈은 sync 호출자가 단발성으로 enqueue할 수 있도록 단명 pool을 생성해 사용한다.

USE_ARQ_WORKER=false 이거나 enqueue 실패 시 호출자는 자체 fallback(BackgroundTasks 등)을
실행하도록 bool 반환. 디스패치 호출 자체가 색인 흐름을 막아서는 안 된다.
"""

from __future__ import annotations

import asyncio
import dataclasses
import logging
from typing import Any

from app.api.dependencies.auth import AdminPrincipal
from app.core.config import settings

logger = logging.getLogger(__name__)


def _principal_to_dict(principal: AdminPrincipal) -> dict[str, Any]:
    return dataclasses.asdict(principal)


def is_arq_enabled() -> bool:
    return bool(settings.use_arq_worker and settings.api_redis_url)


def enqueue_reindex(
    principal: AdminPrincipal,
    knowledge_id: str,
    job_id: str,
) -> bool:
    """sync 호출자용 enqueue 헬퍼. 실패 시 False 반환(호출자는 fallback 실행)."""
    if not is_arq_enabled():
        return False

    payload = (_principal_to_dict(principal), knowledge_id, job_id)

    async def _go() -> None:
        from arq.connections import RedisSettings, create_pool  # noqa: PLC0415

        pool = await create_pool(RedisSettings.from_dsn(settings.api_redis_url))
        try:
            await pool.enqueue_job("process_reindex_job", *payload)
        finally:
            await pool.close()

    try:
        # threadpool에서 호출되는 경우(sync route) — 새 이벤트 루프 OK
        # 이미 이벤트 루프가 도는 컨텍스트(async route)면 asyncio.run이 RuntimeError
        try:
            asyncio.get_running_loop()
            # 러닝 루프가 있으면 이 함수를 sync에서 호출한 게 아니라는 뜻 — 비정상.
            # 안전하게 to_thread로 격리해서 새 루프에서 실행.
            import concurrent.futures  # noqa: PLC0415
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool_exec:
                pool_exec.submit(lambda: asyncio.run(_go())).result(timeout=10)
        except RuntimeError:
            # 러닝 루프 없음 — 정상 sync 컨텍스트
            asyncio.run(_go())
        logger.info(
            "[ARQ_DISPATCH] enqueued reindex knowledge_id=%s job_id=%s",
            knowledge_id, job_id,
        )
        return True
    except Exception as exc:
        logger.error(
            "[ARQ_DISPATCH_FAILED] knowledge_id=%s job_id=%s error=%s — falling back",
            knowledge_id, job_id, exc,
        )
        return False
