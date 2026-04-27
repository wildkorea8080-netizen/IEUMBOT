import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.middleware import MaintenanceModeMiddleware, RequestLoggingMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger = logging.getLogger(__name__)
    logger.info("Starting IEUMBOT API (env=%s)", settings.api_env)
    yield
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
