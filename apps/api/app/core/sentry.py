"""Sentry SDK 초기화 — DSN 미설정 시 no-op.

iwinv/Coolify 배포 시 Sentry 계정 발급 후 SENTRY_DSN 환경변수 주입으로 활성화.
민감 정보(PII) 자동 제거. FastAPI 미들웨어 자동 통합.
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def init_sentry() -> bool:
    """SENTRY_DSN이 있으면 SDK 초기화. 반환: 초기화 여부."""
    dsn = (settings.sentry_dsn or "").strip()
    if not dsn:
        logger.info("[SENTRY] DSN 미설정 — 비활성")
        return False
    try:
        import sentry_sdk  # noqa: PLC0415
        from sentry_sdk.integrations.fastapi import FastApiIntegration  # noqa: PLC0415
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration  # noqa: PLC0415
        from sentry_sdk.integrations.starlette import StarletteIntegration  # noqa: PLC0415
    except ImportError as exc:
        logger.warning("[SENTRY] sentry-sdk 미설치: %s", exc)
        return False

    environment = (settings.sentry_environment or settings.api_env or "unknown").strip()
    traces_rate = max(0.0, min(1.0, float(settings.sentry_traces_sample_rate or 0.0)))

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        traces_sample_rate=traces_rate,
        send_default_pii=False,  # PII(쿠키, IP) 자동 수집 안 함
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            SqlalchemyIntegration(),
        ],
        # 운영 노이즈 줄이기
        ignore_errors=[
            "KeyboardInterrupt",
        ],
        # before_send 훅으로 PII 추가 마스킹 가능 (필요 시 확장)
    )
    logger.info("[SENTRY] 초기화 완료 env=%s traces_rate=%.3f", environment, traces_rate)
    return True
