import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.middleware import MaintenanceModeMiddleware, RequestLoggingMiddleware


def _ensure_critical_columns() -> None:
    """Alembic 마이그레이션 실패 보완: 핵심 컬럼 누락 시 직접 추가."""
    try:
        from app.db import engine  # noqa: PLC0415
        with engine.connect() as conn:
            critical = [
                ("system_api_configs", "fast_model", "VARCHAR(120)"),
                ("knowledge_staging_sessions", "total_chunks", "INTEGER DEFAULT 0"),
            ]
            for table, col, col_type in critical:
                result = conn.execute(__import__("sqlalchemy").text(
                    f"SELECT column_name FROM information_schema.columns "
                    f"WHERE table_name='{table}' AND column_name='{col}'"
                ))
                if result.fetchone() is None:
                    try:
                        conn.execute(__import__("sqlalchemy").text(
                            f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"
                        ))
                        conn.commit()
                        logging.getLogger(__name__).info("[STARTUP] Added missing column %s.%s", table, col)
                    except Exception as col_exc:
                        logging.getLogger(__name__).warning("[STARTUP] Could not add %s.%s: %s", table, col, col_exc)
                        conn.rollback()
    except Exception as exc:
        logging.getLogger(__name__).warning("[STARTUP] Column check skipped: %s", exc)


def _run_migrations() -> None:
    """시작 시 Alembic 마이그레이션 자동 적용 (이미 적용된 것은 건너뜀)."""
    try:
        from alembic import command
        from alembic.config import Config

        alembic_cfg_path = Path(__file__).resolve().parents[1] / "alembic.ini"
        if not alembic_cfg_path.exists():
            logging.getLogger(__name__).warning("alembic.ini not found, skipping auto-migration")
            return

        cfg = Config(str(alembic_cfg_path))
        command.upgrade(cfg, "head")
        logging.getLogger(__name__).info("[MIGRATION] alembic upgrade head completed")
    except Exception as exc:
        logging.getLogger(__name__).warning("[MIGRATION] auto-migration failed (non-fatal): %s", exc)
    finally:
        # Alembic 실패해도 핵심 컬럼은 직접 보장
        _ensure_critical_columns()


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger = logging.getLogger(__name__)
    _run_migrations()
    logger.info("Starting IEUMBOT API (env=%s)", settings.api_env)
    print(f"[CONFIG] use_dynamic_followup={settings.use_dynamic_followup}", flush=True)
    print(f"[CONFIG] use_hybrid_search={settings.use_hybrid_search}", flush=True)
    print(f"[CONFIG] use_reranking={settings.use_reranking}", flush=True)

    # ── 지식 자동 동기화 스케줄러 (Sprint 3-C) ────────────────────────────────
    scheduler = None
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
        print("[SCHEDULER] 지식 자동 동기화 스케줄러 시작", flush=True)
    except ImportError:
        print("[SCHEDULER] apscheduler 미설치 — 자동 동기화 비활성", flush=True)
    except Exception as exc:
        print(f"[SCHEDULER] 스케줄러 시작 실패: {exc}", flush=True)

    yield

    if scheduler is not None:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass
    logger.info("Shutting down IEUMBOT API")


def create_app() -> FastAPI:
    setup_logging()

    app = FastAPI(
        title=settings.api_name,
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id"],
    )
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
