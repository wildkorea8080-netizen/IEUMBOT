import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from app.api.router import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.middleware import MaintenanceModeMiddleware, RequestLoggingMiddleware
from app.core.middleware.cors import SplitCORSMiddleware


def _log_schema_status() -> None:
    """DB 스키마 버전을 alembic head와 비교해 경고 로그.

    실제 마이그레이션 실행은 배포 파이프라인에서 처리:
      - Render: scripts/render_start.sh (alembic upgrade head)
      - Docker/Coolify: scripts/start.sh (alembic upgrade head)
      - 로컬 개발: `cd apps/api && alembic upgrade head`

    여기서는 운영 가시성 확보만 — 마이그레이션 누락 시 fail 대신 WARNING.
    """
    logger = logging.getLogger(__name__)
    try:
        from alembic.config import Config  # noqa: PLC0415
        from alembic.runtime.migration import MigrationContext  # noqa: PLC0415
        from alembic.script import ScriptDirectory  # noqa: PLC0415

        from app.db import engine  # noqa: PLC0415

        alembic_cfg_path = Path(__file__).resolve().parents[1] / "alembic.ini"
        if not alembic_cfg_path.exists():
            logger.warning("[SCHEMA] alembic.ini not found at %s", alembic_cfg_path)
            return

        cfg = Config(str(alembic_cfg_path))
        script = ScriptDirectory.from_config(cfg)
        expected_head = script.get_current_head()

        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            current = ctx.get_current_revision()

        if current == expected_head:
            logger.info("[SCHEMA] up-to-date revision=%s", current)
        else:
            logger.warning(
                "[SCHEMA] DB out of date — current=%s expected=%s. "
                "Run `alembic upgrade head` (deploy pipeline must execute it).",
                current,
                expected_head,
            )
    except Exception as exc:  # noqa: BLE001 — 운영 가시성용, 절대 fail 금지
        logger.warning("[SCHEMA] status check skipped: %s", exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger = logging.getLogger(__name__)
    _log_schema_status()
    logger.info("Starting IEUMBOT API (env=%s)", settings.api_env)
    print(f"[CONFIG] use_dynamic_followup={settings.use_dynamic_followup}", flush=True)
    print(f"[CONFIG] use_hybrid_search={settings.use_hybrid_search}", flush=True)
    print(f"[CONFIG] use_reranking={settings.use_reranking}", flush=True)

    # ── 지식 자동 동기화 스케줄러 (Sprint 3-C) ────────────────────────────────
    # USE_ARQ_WORKER=true 이면 Arq cron(workers/main.py)이 처리 → 다중 인스턴스 안전.
    # 그렇지 않으면 in-process APScheduler 폴백(단일 인스턴스만 안전).
    scheduler = None
    if settings.use_arq_worker:
        print(
            "[SCHEDULER] use_arq_worker=true — APScheduler 비활성. "
            "워커의 Arq cron(sync_due_web_sources)이 매시간 정각 실행.",
            flush=True,
        )
    else:
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler  # noqa: PLC0415
            from app.services.admin.knowledge_sync_service import sync_all_due_web_sources  # noqa: PLC0415

            scheduler = AsyncIOScheduler(timezone="UTC")
            scheduler.add_job(
                sync_all_due_web_sources,
                trigger="interval",
                hours=1,
                id="knowledge_sync",
                replace_existing=True,
            )
            scheduler.start()
            print(
                "[SCHEDULER] 지식 자동 동기화 스케줄러 시작 (in-process APScheduler — 단일 인스턴스 전용)",
                flush=True,
            )
        except ImportError:
            print("[SCHEDULER] apscheduler 미설치 — 자동 동기화 비활성", flush=True)
        except Exception as exc:
            print(f"[SCHEDULER] 스케줄러 시작 실패: {exc}", flush=True)

    yield

    # ── Graceful shutdown ─────────────────────────────────────────────────────
    # 1) 스케줄러 정리
    if scheduler is not None:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass

    # 2) HTTP/LLM 클라이언트 풀 정리 (httpx connection pool, SDK clients)
    try:
        from app.services.web_fetcher import close_client as _close_web_client  # noqa: PLC0415

        _close_web_client()
    except Exception as exc:
        logger.warning("[SHUTDOWN] web_fetcher close failed: %s", exc)
    try:
        from app.services.chat.answer_generation_service import reset_llm_clients  # noqa: PLC0415
        from app.services.embedding_service import reset_embedding_clients  # noqa: PLC0415

        reset_llm_clients()
        reset_embedding_clients()
    except Exception as exc:
        logger.warning("[SHUTDOWN] LLM client reset failed: %s", exc)

    # 3) Redis 캐시 클라이언트 정리
    try:
        from app.core import cache as _cache  # noqa: PLC0415

        _cache.close()
    except Exception as exc:
        logger.warning("[SHUTDOWN] cache close failed: %s", exc)

    # 4) Langfuse flush (관측성 데이터 누락 방지)
    try:
        from app.services.monitoring import langfuse_service  # noqa: PLC0415

        langfuse_service.flush()
    except Exception:
        pass
    logger.info("Shutting down IEUMBOT API")


def create_app() -> FastAPI:
    setup_logging()

    # Sentry는 FastAPI 인스턴스 생성 전에 초기화해야 미들웨어가 자동 등록됨
    from app.core.sentry import init_sentry  # noqa: PLC0415
    init_sentry()

    app = FastAPI(
        title=settings.api_name,
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # CORS — 경로별 분기:
    #   /api/widget/* /api/chat/* → allow_origins=* (기관 홈페이지 어디서나 위젯 로드 가능)
    #   그 외                     → settings.api_allowed_origins 목록만 허용 (관리자 세션 쿠키)
    app.add_middleware(SplitCORSMiddleware)
    app.add_middleware(MaintenanceModeMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.include_router(api_router, prefix="/api")

    @app.get("/api")
    def api_root() -> dict[str, str]:
        return {
            "message": "IEUMBOT API skeleton",
            "environment": settings.api_env,
        }

    return app


app = create_app()
