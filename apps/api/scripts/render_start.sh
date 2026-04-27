#!/usr/bin/env bash
set -e

echo "Running migrations..."
alembic upgrade head

echo "Seeding admins..."
python -m app.scripts.seed_local_admins

echo "Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}