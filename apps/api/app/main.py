import asyncio
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


async def _event_loop_watchdog(interval: float = 0.5, threshold_seconds: float = 1.0) -> None:
    """이벤트 루프가 막힌 시간을 직접 재서 경고 로그를 남긴다.

    uvicorn 워커가 1개라 이벤트 루프가 막히면 API 전체가 무응답이 된다
    (위젯 설정 조회·관리자 로그인·헬스체크까지 동시 정지). 과거 이 현상의
    원인 추적에 며칠이 걸렸으므로, 재발 시 즉시 확인 가능하도록 상시 계측한다.

    탐지 방법: 0.5초 sleep 후 실제 경과 시간을 비교 — 초과분이 루프가 막힌 시간.
    비용: 2초에 1회 타이머, 사실상 0.
    로그 검색: `grep EVENT_LOOP_STALL`
    """
    loop = asyncio.get_running_loop()
    logger = logging.getLogger(__name__)
    while True:
        started = loop.time()
        await asyncio.sleep(interval)
        stalled = loop.time() - started - interval
        if stalled >= threshold_seconds:
            logger.warning(
                "[EVENT_LOOP_STALL] blocked_for=%.2fs threshold=%.1fs "
                "— 이 시간 동안 모든 요청이 정지됨. 동기 blocking 호출을 의심할 것.",
                stalled,
                threshold_seconds,
            )


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

            # ── AI 답변 품질 야간 평가 폴백 ────────────────────────────────────
            # USE_ARQ_WORKER=true면 Arq cron(evaluate_answer_quality, 03:10)이 처리한다.
            # 그게 꺼진 기본 배포에서는 이 등록이 없으면 관리자가 품질 평가 토글을
            # 켜도 아무 것도 돌지 않는다 — "다음 날 새벽부터 채점이 시작됩니다"라고
            # 안내하고 조용히 방치하는 상태였다.
            #
            # 이 스케줄러(scheduler)는 timezone="UTC"로 만들어져 있다. 그대로 hour=3을
            # 쓰면 03:10 UTC(KST 낮 12:10)에 실행돼 "야간 배치"라는 전제가 깨진다.
            # Arq cron은 timezone 인자가 없으면 datetime.now().astimezone().tzinfo,
            # 즉 컨테이너의 시스템 로컬 타임존을 쓴다(TZ=Asia/Seoul 컨테이너 전제) —
            # 이 잡에도 같은 로컬 타임존을 명시해 두 경로가 같은 벽시계 시각에 돈다.
            try:
                from datetime import datetime as _datetime  # noqa: PLC0415

                from app.services.quality.evaluation_service import (  # noqa: PLC0415
                    run_nightly_evaluation_sync,
                )

                local_tz = _datetime.now().astimezone().tzinfo
                scheduler.add_job(
                    run_nightly_evaluation_sync,
                    trigger="cron",
                    hour=3,
                    minute=10,
                    timezone=local_tz,
                    id="quality_evaluation",
                    replace_existing=True,
                )
                print(
                    "[SCHEDULER] AI 답변 품질 야간 평가 등록 "
                    "(in-process APScheduler — 03:10 로컬시간, 단일 인스턴스 전용)",
                    flush=True,
                )
            except Exception as exc:
                # 품질 평가 등록 실패가 지식 동기화 스케줄러 시작까지 막으면 안 된다.
                print(f"[SCHEDULER] 품질 평가 스케줄러 등록 실패: {exc}", flush=True)

            scheduler.start()
            print(
                "[SCHEDULER] 지식 자동 동기화 스케줄러 시작 (in-process APScheduler — 단일 인스턴스 전용)",
                flush=True,
            )
        except ImportError:
            print("[SCHEDULER] apscheduler 미설치 — 자동 동기화 비활성", flush=True)
        except Exception as exc:
            print(f"[SCHEDULER] 스케줄러 시작 실패: {exc}", flush=True)

    watchdog_task = asyncio.create_task(_event_loop_watchdog())
    print("[WATCHDOG] 이벤트 루프 감시 시작 — 1초 이상 정지 시 [EVENT_LOOP_STALL] 경고", flush=True)

    yield

    # ── Graceful shutdown ─────────────────────────────────────────────────────
    # 0) 워치독 정리
    watchdog_task.cancel()

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
