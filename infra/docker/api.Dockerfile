FROM python:3.11-slim AS base
WORKDIR /app

COPY apps/api/pyproject.toml ./apps/api/pyproject.toml
COPY apps/api ./apps/api

RUN pip install --no-cache-dir -e ./apps/api

WORKDIR /app/apps/api
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

