from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.security import decode_access_token
from app.db import SessionLocal
from app.repositories.system_controls_repository import get_current_maintenance

EXEMPT_PREFIXES = (
    "/api/public",
    "/api/health",
    "/api/admin/auth",
    "/api/docs",
    "/api/openapi.json",
)


class MaintenanceModeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if path == "/api" or any(path.startswith(prefix) for prefix in EXEMPT_PREFIXES):
            return await call_next(request)

        if self._is_super_admin_bypass(request):
            return await call_next(request)

        db = SessionLocal()
        try:
            maintenance = get_current_maintenance(db)
        finally:
            db.close()

        if maintenance is None:
            return await call_next(request)

        if self._is_allowed_by_role(request, maintenance.allowed_roles):
            return await call_next(request)

        if maintenance.mode == "block_all":
            return self._blocked_response(maintenance.message)
        if maintenance.mode == "read_only" and request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
            return self._blocked_response(maintenance.message)
        if maintenance.mode == "partial":
            allowed_paths = [str(item).strip() for item in (maintenance.allowed_paths or []) if str(item).strip()]
            if not any(path.startswith(prefix) for prefix in allowed_paths):
                return self._blocked_response(maintenance.message)

        return await call_next(request)

    def _is_super_admin_bypass(self, request: Request) -> bool:
        authorization = request.headers.get("authorization", "")
        if not authorization.lower().startswith("bearer "):
            return False
        token = authorization.split(" ", 1)[1].strip()
        if not token:
            return False
        try:
            payload = decode_access_token(token)
        except Exception:
            return False
        return payload.get("role") == "super_admin" and not bool(payload.get("impersonation"))

    def _is_allowed_by_role(self, request: Request, allowed_roles: list[str] | None) -> bool:
        if not allowed_roles:
            return False
        authorization = request.headers.get("authorization", "")
        if not authorization.lower().startswith("bearer "):
            return False
        token = authorization.split(" ", 1)[1].strip()
        if not token:
            return False
        try:
            payload = decode_access_token(token)
        except Exception:
            return False
        return str(payload.get("role")) in {str(role) for role in allowed_roles}

    def _blocked_response(self, message: str) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": message or "System maintenance is in progress.",
                "error": {"code": "SYSTEM_MAINTENANCE_ACTIVE", "message": message or "System maintenance is in progress."},
            },
        )
