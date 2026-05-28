#!/usr/bin/env bash
# 플랫폼 독립 API 부트스트랩.
# - Render: 서비스 Start Command에 `bash scripts/start.sh`
# - Coolify/iwinv: 컨테이너 CMD 또는 pre-deploy + start 분리
# - Local Docker: docker-compose가 이 스크립트를 ENTRYPOINT/CMD로 사용
#
# Cloud-native 권장: 마이그레이션은 별도 deploy job으로 분리.
# 이 스크립트는 단일 컨테이너 배포 시 안전한 시작 순서를 보장.

set -euo pipefail

echo "[start] Running migrations..."
alembic upgrade head

echo "[start] Seeding admins (idempotent)..."
python -m app.scripts.seed_local_admins || echo "[start] seed skipped: $?"

echo "[start] Launching uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
