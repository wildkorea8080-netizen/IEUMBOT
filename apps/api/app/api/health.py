from fastapi import APIRouter

from app.schemas import ApiSchema

router = APIRouter(tags=["health"])


class HealthResponse(ApiSchema):
    status: str
    service: str


class ReadyDependencies(ApiSchema):
    postgres: str
    redis: str
    storage: str
    openai: str


class ReadyResponse(ApiSchema):
    status: str
    dependencies: ReadyDependencies


@router.get("/health")
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="ieumbot-api")


@router.get("/health/ready")
def ready() -> ReadyResponse:
    return ReadyResponse(
        status="ok",
        dependencies=ReadyDependencies(
            postgres="unknown",
            redis="unknown",
            storage="unknown",
            openai="unknown",
        ),
    )
