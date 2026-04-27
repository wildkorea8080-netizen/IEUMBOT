FROM python:3.11-slim AS base
WORKDIR /app

COPY apps/api/pyproject.toml ./apps/api/pyproject.toml
COPY apps/api ./apps/api

RUN pip install --no-cache-dir -e ./apps/api

WORKDIR /app/apps/api
CMD ["python", "-c", "print('Worker scaffold: no business logic yet')"]

