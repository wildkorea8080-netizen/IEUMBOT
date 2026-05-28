FROM python:3.11-slim AS base
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        poppler-utils \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-kor \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/pyproject.toml ./apps/api/pyproject.toml
COPY apps/api ./apps/api

RUN pip install --no-cache-dir -e ./apps/api

WORKDIR /app/apps/api
# Arq 워커 실행. USE_ARQ_WORKER=true + API_REDIS_URL이 가용해야 의미 있음.
# 워커는 마이그레이션을 직접 실행하지 않음(API/배포 파이프라인이 alembic upgrade 처리).
CMD ["arq", "app.workers.main.WorkerSettings"]
