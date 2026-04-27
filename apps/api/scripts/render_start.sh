#!/usr/bin/env bash
set -e

alembic upgrade head
python -m app.scripts.seed_local_admins
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
