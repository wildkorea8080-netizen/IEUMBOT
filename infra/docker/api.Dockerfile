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

# 컨테이너 헬스체크 — /api/health(liveness)가 멈추면 unhealthy로 표시되어
# 오케스트레이터(Coolify 등)가 자동 재시작할 수 있게 신호를 준다.
# httpx는 이미 설치된 의존성이라 curl 불필요. PORT env를 존중(기본 8000).
# start-period 60s: 시작 시 alembic upgrade + seed + uvicorn 부팅 시간 확보.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import os,sys,httpx; p=os.environ.get('PORT','8000'); sys.exit(0 if httpx.get(f'http://127.0.0.1:{p}/api/health', timeout=4).status_code==200 else 1)" || exit 1

# scripts/start.sh가 alembic upgrade head + seed + uvicorn을 순서대로 실행.
# 다중 인스턴스 배포 환경에서는 이 CMD 대신 마이그레이션을 별도 deploy job으로 분리하고
# CMD를 `uvicorn app.main:app --host 0.0.0.0 --port 8000`로 단순화 권장.
CMD ["bash", "scripts/start.sh"]
