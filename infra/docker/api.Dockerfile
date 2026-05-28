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
# scripts/start.sh가 alembic upgrade head + seed + uvicorn을 순서대로 실행.
# 다중 인스턴스 배포 환경에서는 이 CMD 대신 마이그레이션을 별도 deploy job으로 분리하고
# CMD를 `uvicorn app.main:app --host 0.0.0.0 --port 8000`로 단순화 권장.
CMD ["bash", "scripts/start.sh"]
